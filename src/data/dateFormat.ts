import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";

import { parseDateKey, todayKey } from "./date";

export const dateLocaleForLanguage = (language: string) => (language.startsWith("zh") ? zhCN : enUS);

export const formatHeaderDate = (dateKey: string, language: string) =>
  format(parseDateKey(dateKey), language.startsWith("zh") ? "yyyy年M月d日" : "MMM d, yyyy", {
    locale: dateLocaleForLanguage(language),
  });

export const formatMonthTitle = (dateKey: string, language: string) =>
  format(parseDateKey(dateKey), language.startsWith("zh") ? "yyyy年M月" : "MMM yyyy", {
    locale: dateLocaleForLanguage(language),
  });

export const formatWeekday = (date: Date, language: string) =>
  format(date, language.startsWith("zh") ? "EEEEE" : "EEE", { locale: dateLocaleForLanguage(language) });

export const formatWeekDate = (date: Date, language: string) =>
  format(date, language.startsWith("zh") ? "M月d日" : "MMM d", { locale: dateLocaleForLanguage(language) });

export const selectedDateTaskLabel = (
  dateKey: string,
  language: string,
  labels: { today: string; tomorrow: string; selectedDateTasks: string },
) => {
  const today = todayKey();
  if (dateKey === today) {
    return labels.today;
  }

  const tomorrow = new Date(`${today}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = format(tomorrow, "yyyy-MM-dd");

  if (dateKey === tomorrowKey) {
    return labels.tomorrow;
  }

  return labels.selectedDateTasks.replace("{{date}}", formatHeaderDate(dateKey, language));
};
