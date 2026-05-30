import { describe, expect, it, vi } from "vitest";

import { formatHeaderDate, formatMonthTitle, formatWeekDate, formatWeekday, selectedDateTaskLabel } from "./dateFormat";

describe("date formatting helpers", () => {
  it("formats header and calendar labels by language", () => {
    expect(formatHeaderDate("2026-06-01", "zh")).toBe("2026年6月1日");
    expect(formatHeaderDate("2026-06-01", "en")).toBe("Jun 1, 2026");
    expect(formatMonthTitle("2026-06-01", "zh")).toBe("2026年6月");
    expect(formatMonthTitle("2026-06-01", "en")).toBe("Jun 2026");
    expect(formatWeekday(new Date("2026-06-01T00:00:00"), "zh")).toBe("一");
    expect(formatWeekday(new Date("2026-06-01T00:00:00"), "en")).toBe("Mon");
    expect(formatWeekDate(new Date("2026-06-01T00:00:00"), "zh")).toBe("6月1日");
  });

  it("labels today, tomorrow, and selected dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T12:00:00"));

    expect(
      selectedDateTaskLabel("2026-06-01", "zh", {
        today: "今天",
        tomorrow: "明天",
        selectedDateTasks: "{{date}} 的任务",
      }),
    ).toBe("今天");
    expect(
      selectedDateTaskLabel("2026-06-02", "zh", {
        today: "今天",
        tomorrow: "明天",
        selectedDateTasks: "{{date}} 的任务",
      }),
    ).toBe("明天");
    expect(
      selectedDateTaskLabel("2026-06-03", "zh", {
        today: "今天",
        tomorrow: "明天",
        selectedDateTasks: "{{date}} 的任务",
      }),
    ).toBe("2026年6月3日 的任务");

    vi.useRealTimers();
  });
});
