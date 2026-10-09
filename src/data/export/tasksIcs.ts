import type { Project, Reminder, Task } from "../types";

export const icsText = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

export const pad2 = (n: number): string => String(n).padStart(2, "0");

export const icsAllDayDate = (task: Task): string => task.dueDate.replace(/-/g, "");

export const icsUtcDateTime = (task: Task): string => {
  const [year, month, day] = task.dueDate.split("-").map(Number);
  const [hours, minutes] = (task.dueTime ?? "00:00").split(":").map(Number);
  const local = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return `${local.getUTCFullYear()}${pad2(local.getUTCMonth() + 1)}${pad2(local.getUTCDate())}T${pad2(local.getUTCHours())}${pad2(local.getUTCMinutes())}${pad2(local.getUTCSeconds())}Z`;
};

export const isoToIcsUtc = (iso: string): string => {
  const date = new Date(iso);
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`;
};

export const foldLine = (line: string): string => {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) {
    return line;
  }
  const decoder = new TextDecoder("utf-8");
  const chunks: string[] = [];
  let offset = 0;
  let firstLine = true;
  while (offset < bytes.length) {
    const maxLen = firstLine ? 75 : 74;
    const end = Math.min(offset + maxLen, bytes.length);
    let sliceEnd = end;
    while (sliceEnd < bytes.length && (bytes[sliceEnd] & 0xc0) === 0x80) {
      sliceEnd--;
    }
    chunks.push(decoder.decode(bytes.subarray(offset, sliceEnd)));
    offset = sliceEnd;
    firstLine = false;
  }
  return chunks.join("\r\n ");
};

export const icsPriorityMap: Record<Task["priority"], number> = {
  high: 1,
  medium: 5,
  low: 9,
};

export const buildValarm = (reminder: Reminder): string[] => {
  const offsetMinutes = reminder.offsetMinutes ?? 0;
  const trigger = offsetMinutes > 0 ? `-PT${offsetMinutes}M` : "PT0S";
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reminder",
    `TRIGGER:${trigger}`,
    "END:VALARM",
  ];
};

export const buildTasksIcs = (data: { tasks: Task[]; reminders: Reminder[]; projects?: Project[] }): string => {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WhatToDo//Tasks//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  const projectsById = new Map((data.projects ?? []).map((project) => [project.id, project]));

  for (const task of data.tasks) {
    const hasTime = task.dueTime !== null;
    const dueValue = hasTime ? icsUtcDateTime(task) : icsAllDayDate(task);
    const duePrefix = hasTime ? "DUE" : "DUE;VALUE=DATE";

    lines.push("BEGIN:VTODO");
    lines.push(`UID:${task.id}@whattodo`);
    lines.push(`DTSTAMP:${isoToIcsUtc(task.updatedAt)}`);
    lines.push(`CREATED:${isoToIcsUtc(task.createdAt)}`);
    lines.push(`LAST-MODIFIED:${isoToIcsUtc(task.updatedAt)}`);
    lines.push(`${duePrefix}:${dueValue}`);
    lines.push(`SUMMARY:${icsText(task.title)}`);
    if (task.notes) {
      lines.push(`DESCRIPTION:${icsText(task.notes)}`);
    }
    if (task.projectId) {
      const projectName = projectsById.get(task.projectId)?.name;
      if (projectName) {
        lines.push(`CATEGORIES:${icsText(projectName)}`);
      }
    }
    lines.push(`PRIORITY:${icsPriorityMap[task.priority]}`);

    // VTODO STATUS values per RFC 5545 §3.2.20 / §3.8.1.11
    if (task.status === "completed") {
      lines.push("STATUS:COMPLETED");
      if (task.completedAt) {
        lines.push(`COMPLETED:${isoToIcsUtc(task.completedAt)}`);
      }
      lines.push("PERCENT-COMPLETE:100");
    } else if (task.status === "cancelled") {
      lines.push("STATUS:CANCELLED");
    } else if (task.status === "in_progress") {
      lines.push("STATUS:IN-PROCESS");
      lines.push("PERCENT-COMPLETE:50");
    } else {
      lines.push("STATUS:NEEDS-ACTION");
    }

    const reminder = data.reminders.find(
      (item) => item.taskId === task.id && item.enabled && item.firedAt === null,
    );
    if (reminder) {
      lines.push(...buildValarm(reminder));
    }

    lines.push("END:VTODO");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
};
