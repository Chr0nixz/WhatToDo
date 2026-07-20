import { addDays, format, parse } from "date-fns";

import type { CreateTaskInput, Project, RecurrenceFrequency, TaskPriority } from "./types";

const weekdayMap: Record<string, number> = {
  "一": 1,
  "二": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "日": 0,
  "天": 0,
};

const chineseNumMap: Record<string, number> = {
  "一": 1,
  "两": 2,
  "二": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "七": 7,
  "八": 8,
  "九": 9,
  "十": 10,
};

const nextWeekdayDate = (referenceDate: Date, targetDay: number, weekOffset = 0): Date => {
  const currentDay = referenceDate.getDay();
  let diff = (targetDay - currentDay + 7) % 7;
  if (diff === 0 && weekOffset === 0) {
    diff = 7;
  }
  return addDays(referenceDate, diff + weekOffset * 7);
};

/** Recurrence first instance may start today when the weekday matches. */
const nextRecurrenceWeekdayDate = (referenceDate: Date, targetDay: number): Date => {
  const currentDay = referenceDate.getDay();
  const diff = (targetDay - currentDay + 7) % 7;
  return addDays(referenceDate, diff);
};

const endOfMonthDate = (referenceDate: Date): Date =>
  new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);

const nextMonthSameDay = (referenceDate: Date, day?: number): Date => {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const targetDay = day ?? referenceDate.getDate();
  const candidate = new Date(year, month + 1, targetDay);
  if (candidate.getMonth() !== (month + 1) % 12) {
    return new Date(year, month + 2, 0);
  }
  return candidate;
};

type QuickAddOptions = {
  input: string;
  referenceDate?: Date;
  projects: Project[];
  defaultReminderOffset: number;
};

export type QuickAddResult = {
  input: string;
  draft: CreateTaskInput;
  matches: QuickAddMatch[];
  matched: {
    date: boolean;
    time: boolean;
    project: boolean;
    priority: boolean;
    reminder: boolean;
    recurrence: boolean;
  };
};

export type QuickAddMatch =
  | { kind: "date"; value: string }
  | { kind: "time"; value: string }
  | { kind: "project"; value: string; projectId: string }
  | { kind: "priority"; value: TaskPriority }
  | { kind: "reminder"; value: number | null }
  | {
      kind: "recurrence";
      frequency: RecurrenceFrequency;
      interval: number;
      byWeekday: number[] | null;
      label: string;
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
  const matched = { date: false, time: false, project: false, priority: false, reminder: false, recurrence: false };
  const matches: QuickAddMatch[] = [];

  const applyRecurrence = (
    frequency: RecurrenceFrequency,
    interval: number,
    byWeekday: number[] | null,
    label: string,
    firstDue: string,
  ) => {
    dueDate = firstDue;
    matched.date = true;
    matched.recurrence = true;
    matches.push({ kind: "date", value: firstDue });
    matches.push({ kind: "recurrence", frequency, interval, byWeekday, label });
  };

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
      matches.push({ kind: "project", value: project.name, projectId: project.id });
      title = title.replace(projectMatch[0], " ").replace(/\s+/g, " ").trim();
    }
  }

  remove(/(?:^|\s)!([^\s#!]+)/, (match) => {
    const nextPriority = priorityAliases[match[1].trim().toLowerCase()] ?? priorityAliases[match[1].trim()];
    if (nextPriority) {
      priority = nextPriority;
      matched.priority = true;
      matches.push({ kind: "priority", value: nextPriority });
    }
  });

  remove(/(?:提前|remind\s*)(\d+)\s*(?:分钟|分|m|min|minutes?)/i, (match) => {
    reminderOffset = Number(match[1]);
    matched.reminder = true;
    matches.push({ kind: "reminder", value: reminderOffset });
  });

  remove(/(?:不提醒|no reminder|without reminder)/i, () => {
    reminderOffset = null;
    matched.reminder = true;
    matches.push({ kind: "reminder", value: null });
  });

  remove(/(今天|today)/i, () => {
    dueDate = toDateKey(referenceDate);
    matched.date = true;
    matches.push({ kind: "date", value: dueDate });
  });

  remove(/(明天|tomorrow)/i, () => {
    dueDate = toDateKey(addDays(referenceDate, 1));
    matched.date = true;
    matches.push({ kind: "date", value: dueDate });
  });

  // 大后天（3 天后，必须在"后天"之前匹配，避免短模式吞掉长模式）
  remove(/(大后天)/, () => {
    dueDate = toDateKey(addDays(referenceDate, 3));
    matched.date = true;
    matches.push({ kind: "date", value: dueDate });
  });

  remove(/(后天)/, () => {
    dueDate = toDateKey(addDays(referenceDate, 2));
    matched.date = true;
    matches.push({ kind: "date", value: dueDate });
  });

  // Recurrence phrases must run before bare 「周X」 so 「每周一」 is not eaten as 「周一」.
  remove(/每两周/, () => {
    applyRecurrence("weekly", 2, null, "每两周", toDateKey(addDays(referenceDate, 14)));
  });
  remove(/\bevery\s*2\s*weeks?\b/i, () => {
    applyRecurrence("weekly", 2, null, "every 2 weeks", toDateKey(addDays(referenceDate, 14)));
  });
  remove(/每周([一二三四五六日天])/, (match) => {
    const target = weekdayMap[match[1]];
    if (target !== undefined) {
      applyRecurrence(
        "weekly",
        1,
        [target],
        `每周${match[1]}`,
        toDateKey(nextRecurrenceWeekdayDate(referenceDate, target)),
      );
    }
  });
  remove(/\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, (match) => {
    const englishWeekday: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const target = englishWeekday[match[1].toLowerCase()];
    if (target !== undefined) {
      applyRecurrence(
        "weekly",
        1,
        [target],
        `every ${match[1].toLowerCase()}`,
        toDateKey(nextRecurrenceWeekdayDate(referenceDate, target)),
      );
    }
  });
  remove(/(每天|每日)/, () => {
    applyRecurrence("daily", 1, null, "每天", toDateKey(referenceDate));
  });
  remove(/\b(every\s+day|daily)\b/i, () => {
    applyRecurrence("daily", 1, null, "daily", toDateKey(referenceDate));
  });
  remove(/每月(\d{1,2})[日号]/, (match) => {
    const day = Number(match[1]);
    if (day >= 1 && day <= 31) {
      dueDate = toDateKey(nextMonthSameDay(referenceDate, day));
      matched.date = true;
      matches.push({ kind: "date", value: dueDate });
    }
  });
  remove(/每月/, () => {
    applyRecurrence("monthly", 1, null, "每月", toDateKey(referenceDate));
  });
  remove(/\b(every\s+month|monthly)\b/i, () => {
    applyRecurrence("monthly", 1, null, "monthly", toDateKey(referenceDate));
  });
  remove(/\bevery\s+week\b/i, () => {
    applyRecurrence("weekly", 1, null, "every week", toDateKey(addDays(referenceDate, 7)));
  });

  // 扩展中文日期解析（按长模式优先排序，避免短模式吞掉长模式）
  // 下下周X（weekOffset=2）
  remove(/下下周([一二三四五六日天])/, (match) => {
    const target = weekdayMap[match[1]];
    if (target !== undefined) {
      dueDate = toDateKey(nextWeekdayDate(referenceDate, target, 2));
      matched.date = true;
      matches.push({ kind: "date", value: dueDate });
    }
  });

  // 下下周（默认下下周一）
  remove(/下下周/, () => {
    dueDate = toDateKey(nextWeekdayDate(referenceDate, 1, 2));
    matched.date = true;
    matches.push({ kind: "date", value: dueDate });
  });

  // 下周X（weekOffset=1）
  remove(/下周([一二三四五六日天])/, (match) => {
    const target = weekdayMap[match[1]];
    if (target !== undefined) {
      dueDate = toDateKey(nextWeekdayDate(referenceDate, target, 1));
      matched.date = true;
      matches.push({ kind: "date", value: dueDate });
    }
  });

  // 下周（默认下周一）
  remove(/下周/, () => {
    dueDate = toDateKey(nextWeekdayDate(referenceDate, 1, 1));
    matched.date = true;
    matches.push({ kind: "date", value: dueDate });
  });

  // 本周X / 这周X（weekOffset=0）
  remove(/(?:本周|这周)([一二三四五六日天])/, (match) => {
    const target = weekdayMap[match[1]];
    if (target !== undefined) {
      dueDate = toDateKey(nextWeekdayDate(referenceDate, target, 0));
      matched.date = true;
      matches.push({ kind: "date", value: dueDate });
    }
  });

  // 本周末（本周六）
  remove(/本周末/, () => {
    dueDate = toDateKey(nextWeekdayDate(referenceDate, 6, 0));
    matched.date = true;
    matches.push({ kind: "date", value: dueDate });
  });

  // 周X前（取本周该日，移除"前"）
  remove(/周([一二三四五六日天])前/, (match) => {
    const target = weekdayMap[match[1]];
    if (target !== undefined) {
      dueDate = toDateKey(nextWeekdayDate(referenceDate, target, 0));
      matched.date = true;
      matches.push({ kind: "date", value: dueDate });
    }
  });

  // 周X（同本周X）
  remove(/周([一二三四五六日天])/, (match) => {
    const target = weekdayMap[match[1]];
    if (target !== undefined) {
      dueDate = toDateKey(nextWeekdayDate(referenceDate, target, 0));
      matched.date = true;
      matches.push({ kind: "date", value: dueDate });
    }
  });

  // X天后（中文数字/阿拉伯数字/"一周"）
  remove(/(一周|两周|[一二两三四五六七八九十]|\d+)天后/, (match) => {
    let days: number | null = null;
    if (match[1] === "一周") {
      days = 7;
    } else if (match[1] === "两周") {
      days = 14;
    } else if (/^\d+$/.test(match[1])) {
      days = Number(match[1]);
    } else {
      days = chineseNumMap[match[1]] ?? null;
    }
    if (days !== null) {
      dueDate = toDateKey(addDays(referenceDate, days));
      matched.date = true;
      matches.push({ kind: "date", value: dueDate });
    }
  });

  // 一周后
  remove(/一周后/, () => {
    dueDate = toDateKey(addDays(referenceDate, 7));
    matched.date = true;
    matches.push({ kind: "date", value: dueDate });
  });

  // 两周后
  remove(/两周后/, () => {
    dueDate = toDateKey(addDays(referenceDate, 14));
    matched.date = true;
    matches.push({ kind: "date", value: dueDate });
  });

  // 月底
  remove(/月底/, () => {
    dueDate = toDateKey(endOfMonthDate(referenceDate));
    matched.date = true;
    matches.push({ kind: "date", value: dueDate });
  });

  // 下个月X日 / 下月X日
  remove(/(?:下个月|下月)(\d{1,2})[日号]/, (match) => {
    const day = Number(match[1]);
    if (day >= 1 && day <= 31) {
      dueDate = toDateKey(nextMonthSameDay(referenceDate, day));
      matched.date = true;
      matches.push({ kind: "date", value: dueDate });
    }
  });

  // 下个月 / 下月（同日，溢出回退月末）
  remove(/(?:下个月|下月)(?!\d)/, () => {
    dueDate = toDateKey(nextMonthSameDay(referenceDate));
    matched.date = true;
    matches.push({ kind: "date", value: dueDate });
  });

  remove(/\b(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|\d{1,2}[-/.月]\d{1,2}日?)\b/, (match) => {
    const parsed = parseAbsoluteDate(match[1], referenceDate);
    if (parsed) {
      dueDate = toDateKey(parsed);
      matched.date = true;
      matches.push({ kind: "date", value: dueDate });
    }
  });

  remove(/(上午|下午|晚上|中午)?\s*\d{1,2}(?:点|:)\d{0,2}|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i, (match) => {
    const parsed = parseTimeToken(match[0]);
    if (parsed) {
      dueTime = parsed;
      matched.time = true;
      matches.push({ kind: "time", value: parsed });
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
    matches,
    matched,
  };
};
