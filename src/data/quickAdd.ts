import { addDays, format, parse } from "date-fns";

import type { CreateTaskInput, Project, TaskPriority } from "./types";

type QuickAddOptions = {
  input: string;
  referenceDate?: Date;
  projects: Project[];
  defaultReminderOffset: number;
};

export type QuickAddResult = {
  input: string;
  draft: CreateTaskInput;
  matched: {
    date: boolean;
    time: boolean;
    project: boolean;
    priority: boolean;
    reminder: boolean;
  };
};

const priorityAliases: Record<string, TaskPriority> = {
  高: "high",
  高优先级: "high",
  high: "high",
  h: "high",
  中: "medium",
  中优先级: "medium",
  medium: "medium",
  med: "medium",
  m: "medium",
  低: "low",
  低优先级: "low",
  low: "low",
  l: "low",
};

const toDateKey = (date: Date) => format(date, "yyyy-MM-dd");

const parseAbsoluteDate = (token: string, referenceDate: Date) => {
  const year = referenceDate.getFullYear();
  const normalized = token.replace(/[年月.]/g, "-").replace("日", "").replace(/\//g, "-");
  const patterns = ["yyyy-MM-dd", "MM-dd"];

  for (const pattern of patterns) {
    const parsed = parse(normalized, pattern, referenceDate);
    if (!Number.isNaN(parsed.getTime())) {
      return pattern === "MM-dd" ? new Date(year, parsed.getMonth(), parsed.getDate()) : parsed;
    }
  }

  return null;
};

const parseTimeToken = (token: string) => {
  const chinese = token.match(/(上午|下午|晚上|中午)?\s*(\d{1,2})(?:点|:)(\d{1,2})?/);
  if (chinese) {
    let hour = Number(chinese[2]);
    const minute = chinese[3] ? Number(chinese[3]) : 0;
    const part = chinese[1] ?? "";
    if ((part === "下午" || part === "晚上") && hour < 12) {
      hour += 12;
    }
    if (part === "中午" && hour < 11) {
      hour += 12;
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const english = token.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!english) {
    return null;
  }

  let hour = Number(english[1]);
  const minute = english[2] ? Number(english[2]) : 0;
  const suffix = english[3]?.toLowerCase();
  if (suffix === "pm" && hour < 12) {
    hour += 12;
  }
  if (suffix === "am" && hour === 12) {
    hour = 0;
  }
  if (hour > 23 || minute > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const parseQuickAdd = ({
  input,
  referenceDate = new Date(),
  projects,
  defaultReminderOffset,
}: QuickAddOptions): QuickAddResult => {
  let title = input.trim();
  let dueDate = toDateKey(referenceDate);
  let dueTime: string | null = null;
  let projectId: string | null = null;
  let priority: TaskPriority = "medium";
  let reminderOffset: number | null = defaultReminderOffset;
  const matched = { date: false, time: false, project: false, priority: false, reminder: false };

  const remove = (pattern: RegExp, handler: (match: RegExpMatchArray) => void) => {
    const match = title.match(pattern);
    if (!match) {
      return;
    }
    handler(match);
    title = title.replace(match[0], " ").replace(/\s+/g, " ").trim();
  };

  const projectMatch = title.match(/(?:^|\s)#([^\s#!]+)/);
  if (projectMatch) {
    const projectName = projectMatch[1].trim().toLowerCase();
    const project = projects.find((item) => item.name.trim().toLowerCase() === projectName);
    if (project) {
      projectId = project.id;
      matched.project = true;
      title = title.replace(projectMatch[0], " ").replace(/\s+/g, " ").trim();
    }
  }

  remove(/(?:^|\s)!([^\s#!]+)/, (match) => {
    const nextPriority = priorityAliases[match[1].trim().toLowerCase()] ?? priorityAliases[match[1].trim()];
    if (nextPriority) {
      priority = nextPriority;
      matched.priority = true;
    }
  });

  remove(/(?:提前|remind\s*)(\d+)\s*(?:分钟|分|m|min|minutes?)/i, (match) => {
    reminderOffset = Number(match[1]);
    matched.reminder = true;
  });

  remove(/(?:不提醒|no reminder|without reminder)/i, () => {
    reminderOffset = null;
    matched.reminder = true;
  });

  remove(/(今天|today)/i, () => {
    dueDate = toDateKey(referenceDate);
    matched.date = true;
  });

  remove(/(明天|tomorrow)/i, () => {
    dueDate = toDateKey(addDays(referenceDate, 1));
    matched.date = true;
  });

  remove(/(后天)/, () => {
    dueDate = toDateKey(addDays(referenceDate, 2));
    matched.date = true;
  });

  remove(/\b(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|\d{1,2}[-/.月]\d{1,2}日?)\b/, (match) => {
    const parsed = parseAbsoluteDate(match[1], referenceDate);
    if (parsed) {
      dueDate = toDateKey(parsed);
      matched.date = true;
    }
  });

  remove(/(上午|下午|晚上|中午)?\s*\d{1,2}(?:点|:)\d{0,2}|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i, (match) => {
    const parsed = parseTimeToken(match[0]);
    if (parsed) {
      dueTime = parsed;
      matched.time = true;
    }
  });

  return {
    input,
    draft: {
      title: title || input.trim(),
      dueDate,
      dueTime,
      projectId,
      priority,
      reminderOffset,
    },
    matched,
  };
};
