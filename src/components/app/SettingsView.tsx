import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { Bell, Check, FolderOpen, Languages, Moon, Palette } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AccentColor, AppData, Language, Settings, ThemeMode } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

type SettingsViewProps = {
  data: AppData;
  actions: TodoActions;
};

const accentOptions = [
  { value: "blue", labelKey: "accentBlue", swatch: "oklch(0.61 0.125 210)" },
  { value: "emerald", labelKey: "accentEmerald", swatch: "oklch(0.56 0.13 155)" },
  { value: "amber", labelKey: "accentAmber", swatch: "oklch(0.66 0.13 84)" },
  { value: "rose", labelKey: "accentRose", swatch: "oklch(0.59 0.15 16)" },
  { value: "violet", labelKey: "accentViolet", swatch: "oklch(0.58 0.15 292)" },
] satisfies { value: AccentColor; labelKey: string; swatch: string }[];

const LANGUAGE_STORAGE_KEY = "whattodo:language";

export function SettingsView({ data, actions }: SettingsViewProps) {
  const { i18n, t } = useTranslation();
  const settings = data.settings;
  const [defaultWorkingFolder, setDefaultWorkingFolder] = useState(settings.defaultWorkingFolder ?? "");

  useEffect(() => {
    setDefaultWorkingFolder(settings.defaultWorkingFolder ?? "");
  }, [settings.defaultWorkingFolder]);

  const saveSettings = async (patch: Partial<Settings>) => {
    const nextSettings = { ...settings, ...patch };
    await actions.saveSettings(nextSettings);
    if (patch.language) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, patch.language);
      await i18n.changeLanguage(patch.language);
    }
  };

  const chooseDefaultWorkingFolder = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "Select default folder",
    });

    if (typeof selected === "string") {
      setDefaultWorkingFolder(selected);
      await saveSettings({ defaultWorkingFolder: selected });
    }
  };

  const saveDefaultWorkingFolder = async () => {
    await saveSettings({ defaultWorkingFolder: defaultWorkingFolder.trim() || null });
  };

  const openDefaultWorkingFolder = async () => {
    const folder = settings.defaultWorkingFolder?.trim();

    if (folder) {
      await openPath(folder);
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-4">
      <section className="rounded-lg border border-border bg-card/70 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Moon className="size-4" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">{t("theme")}</h1>
            <p className="text-sm text-muted-foreground">Dark command center, light fallback, or OS preference.</p>
          </div>
        </div>
        <div className="grid gap-4">
          <Segmented
            options={[
              { value: "system", label: t("system") },
              { value: "dark", label: t("dark") },
              { value: "light", label: t("light") },
            ]}
            value={settings.theme}
            onChange={(value) => void saveSettings({ theme: value as ThemeMode })}
          />
          <div className="grid gap-2 rounded-md border border-border bg-background/45 px-3 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Palette className="size-4 text-muted-foreground" />
              {t("accentColor")}
            </div>
            <div className="flex flex-wrap gap-2">
              {accentOptions.map((option) => {
                const isSelected = settings.accentColor === option.value;

                return (
                  <button
                    key={option.value}
                    aria-label={t(option.labelKey)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-2.5 text-sm font-medium transition-colors hover:bg-accent",
                      isSelected && "border-ring bg-accent text-accent-foreground ring-1 ring-ring",
                    )}
                    type="button"
                    onClick={() => void saveSettings({ accentColor: option.value })}
                  >
                    <span
                      className="flex size-4 items-center justify-center rounded-full border border-border/60"
                      style={{ backgroundColor: option.swatch }}
                    >
                      {isSelected && <Check className="size-3 text-primary-foreground" />}
                    </span>
                    <span>{t(option.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card/70 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Languages className="size-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">{t("language")}</h2>
            <p className="text-sm text-muted-foreground">中文与 English can be switched at runtime.</p>
          </div>
        </div>
        <Segmented
          options={[
            { value: "zh", label: t("chinese") },
            { value: "en", label: t("english") },
          ]}
          value={settings.language}
          onChange={(value) => void saveSettings({ language: value as Language })}
        />
      </section>

      <section className="rounded-lg border border-border bg-card/70 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Bell className="size-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">{t("notifications")}</h2>
            <p className="text-sm text-muted-foreground">{t("trayHint")}</p>
          </div>
        </div>
        <div className="grid gap-3">
          <ToggleRow
            checked={settings.notificationsEnabled}
            label={t("notifications")}
            onClick={() => void saveSettings({ notificationsEnabled: !settings.notificationsEnabled })}
          />
          <ToggleRow
            checked={settings.closeToTray}
            label={t("closeToTray")}
            onClick={() => void saveSettings({ closeToTray: !settings.closeToTray })}
          />
          <label className="grid grid-cols-[1fr_160px] items-center gap-3 rounded-md border border-border bg-background/45 px-3 py-2 text-sm">
            <span>
              <span className="block font-medium">{t("defaultReminder")}</span>
              <span className="text-xs text-muted-foreground">{t("minutes")}</span>
            </span>
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
              min={0}
              step={5}
              type="number"
              value={settings.defaultReminderOffset}
              onChange={(event) => void saveSettings({ defaultReminderOffset: Number(event.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card/70 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <FolderOpen className="size-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">{t("defaultFolder")}</h2>
            <p className="text-sm text-muted-foreground">{t("defaultFolderHint")}</p>
          </div>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2 max-sm:grid-cols-1">
          <input
            className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
            placeholder="D:\\Projects\\..."
            value={defaultWorkingFolder}
            onChange={(event) => setDefaultWorkingFolder(event.target.value)}
          />
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium transition-colors hover:bg-accent"
            type="button"
            onClick={() => void chooseDefaultWorkingFolder()}
          >
            <FolderOpen className="size-4" />
            {t("chooseFolder")}
          </button>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-secondary px-3 text-sm font-medium transition-colors hover:bg-accent"
            type="button"
            onClick={() => void saveDefaultWorkingFolder()}
          >
            {t("save")}
          </button>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            disabled={!settings.defaultWorkingFolder}
            type="button"
            onClick={() => void openDefaultWorkingFolder()}
          >
            {t("openFolder")}
          </button>
        </div>
      </section>
    </main>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-grid grid-flow-col gap-1 rounded-lg border border-border bg-background/55 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          className={cn(
            "h-8 rounded-md px-3 text-sm transition-colors hover:bg-accent",
            value === option.value && "bg-primary text-primary-foreground hover:bg-primary",
          )}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className="flex items-center justify-between rounded-md border border-border bg-background/45 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
      type="button"
      onClick={onClick}
    >
      <span className="font-medium">{label}</span>
      <span
        className={cn(
          "relative h-6 w-10 rounded-full border border-border transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4.5 rounded-full bg-background shadow-sm transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
