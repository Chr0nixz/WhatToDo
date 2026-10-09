import type { Project, Task } from "../types";

export const csvCell = (value: string | number | null | undefined): string => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildTasksCsv = (data: { projects: Project[]; tasks: Task[] }): string => {
  const projectsById = new Map(data.projects.map((project) => [project.id, project.name]));
  const rows = [
    ["Title", "Status", "Priority", "Due date", "Due time", "Project", "Working folder", "Notes", "Completed at", "Created at"],
    ...data.tasks.map((task) => [
      task.title,
      task.status,
      task.priority,
      task.dueDate,
      task.dueTime ?? "",
      task.projectId ? projectsById.get(task.projectId) ?? "" : "",
      task.workingFolder ?? "",
      task.notes,
      task.completedAt ?? "",
      task.createdAt,
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
};
