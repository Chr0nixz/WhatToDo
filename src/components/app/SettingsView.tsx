import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { ArchiveRestore, Bell, Check, Database, Download, FolderOpen, Languages, Moon, Palette, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AccentColor, AppData, Language, Settings, ThemeMode } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";
import { UpdateSettingsPanel } from "./UpdateSettingsPanel";

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
const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const timestampForFile = () => new Date().toISOString().replace(/[:.]/g, "-");

const downloadText = (filename: string, contents: string, mimeType: string) => {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export function SettingsView({ data, actions }: SettingsViewProps) {
  const { i18n, t } = useTranslation();
  const settings = data.settings;
  const [defaultWorkingFolder, setDefaultWorkingFolder] = useState(settings.defaultWorkingFolder ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [dataState, setDataState] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    setDefaultWorkingFolder(settings.defaultWorkingFolder ?? "");
  }, [settings.defaultWorkingFolder]);

  const saveSettings = async (patch: Partial<Settings>) => {
    const nextSettings = { ...settings, ...patch };
    setIsSaving(true);
    setSaveState("idle");

    try {
      await actions.saveSettings(nextSettings);
      if (patch.language) {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, patch.language);
        await i18n.changeLanguage(patch.language);
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      setIsSaving(false);
    }
  };

  const chooseDefaultWorkingFolder = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t("selectDefaultFolder"),
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

  const writeText = async (filename: string, contents: string, mimeType: string) => {
    if (!isTauriRuntime()) {
      downloadText(filename, contents, mimeType);
      return;
    }

    const path = await saveDialog({
      defaultPath: filename,
      filters: [{ name: "Text", extensions: [filename.split(".").pop() ?? "txt"] }],
    });

    if (typeof path === "string") {
      await invoke("write_text_file", { path, contents });
    }
  };

  const exportBackup = async () => {
    setDataState("idle");
    try {
      const payload = await actions.exportBackup();
      await writeText(`whattodo-backup-${timestampForFile()}.json`, JSON.stringify(payload, null, 2), "application/json");
      setDataState("saved");
    } catch {
      setDataState("error");
    }
  };

  const importBackup = async () => {
    if (!isTauriRuntime()) {
      setDataState("error");
      return;
    }

    setDataState("idle");
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "WhatToDo backup", extensions: ["json"] }],
        title: t("importBackup"),
      });

      if (typeof selected !== "string") {
        return;
      }

      const currentBackup = await actions.exportBackup();
      const separator = selected.includes("\\") ? "\\" : "/";
      const parent = selected.split(/[\\/]/).slice(0, -1).join(separator);
      const preImportPath = `${parent}${parent ? separator : ""}whattodo-pre-import-${timestampForFile()}.json`;
      await invoke("write_text_file", { path: preImportPath, contents: JSON.stringify(currentBackup, null, 2) });

      const contents = await invoke<string>("read_text_file", { path: selected });
      await actions.importBackup(JSON.parse(contents));
      setDataState("saved");
    } catch {
      setDataState("error");
    }
  };

  const exportCsv = async () => {
    setDataState("idle");
    try {
      await writeText(`whattodo-tasks-${timestampForFile()}.csv`, await actions.exportCurrentWorkspaceCsv(), "text/csv");
      setDataState("saved");
    } catch {
      setDataState("error");
    }
  };

  const exportIcs = async () => {
    setDataState("idle");
    try {
      await writeText(`whattodo-tasks-${timestampForFile()}.ics`, await actions.exportCurrentWorkspaceIcs(), "text/calendar");
      setDataState("saved");
    } catch {
      setDataState("error");
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-4">
      <section className="motion-surface rounded-lg border border-border bg-card/70 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Moon className="size-4" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">{t("theme")}</h1>
            <p className="text-sm text-muted-foreground">{t("themeHint")}</p>
          </div>
        </div>
        <div className="grid gap-4">
          <Segmented
            disabled={isSaving}
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
                    aria-pressed={isSelected}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50",
                      isSelected && "border-ring bg-accent text-accent-foreground ring-1 ring-ring",
                    )}
                    disabled={isSaving}
                    type="button"
                    onClick={() => void saveSettings({ accentColor: option.value })}
                  >
                    <span
                      className="flex size-4 items-center justify-center rounded-full border border-border/60"
                      style={{ backgroundColor: option.swatch }}
                    >
                      {isSelected && <Check className="motion-status size-3 text-primary-foreground" />}
                    </span>
                    <span>{t(option.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="motion-surface rounded-lg border border-border bg-card/70 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Languages className="size-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">{t("language")}</h2>
            <p className="text-sm text-muted-foreground">{t("languageHint")}</p>
          </div>
        </div>
        <Segmented
          disabled={isSaving}
          options={[
            { value: "zh", label: t("chinese") },
            { value: "en", label: t("english") },
          ]}
          value={settings.language}
          onChange={(value) => void saveSettings({ language: value as Language })}
        />
      </section>

      <section className="motion-surface rounded-lg border border-border bg-card/70 p-4 shadow-sm">
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
            disabled={isSaving}
            label={t("notifications")}
            onClick={() => void saveSettings({ notificationsEnabled: !settings.notificationsEnabled })}
          />
          <ToggleRow
            checked={settings.closeToTray}
            disabled={isSaving}
            label={t("closeToTray")}
            onClick={() => void saveSettings({ closeToTray: !settings.closeToTray })}
          />
          <label className="grid grid-cols-[1fr_160px] items-center gap-3 rounded-md border border-border bg-background/45 px-3 py-2 text-sm">
            <span>
              <span className="block font-medium">{t("defaultReminder")}</span>
              <span className="text-xs text-muted-foreground">{t("minutes")}</span>
            </span>
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-50"
              disabled={isSaving}
              min={0}
              step={5}
              type="number"
              value={settings.defaultReminderOffset}
              onChange={(event) => void saveSettings({ defaultReminderOffset: Number(event.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="motion-surface rounded-lg border border-border bg-card/70 p-4 shadow-sm">
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
            className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-50"
            disabled={isSaving}
            placeholder="D:\\Projects\\..."
            value={defaultWorkingFolder}
            onChange={(event) => setDefaultWorkingFolder(event.target.value)}
          />
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            disabled={isSaving}
            type="button"
            onClick={() => void chooseDefaultWorkingFolder()}
          >
            <FolderOpen className="size-4" />
            {t("chooseFolder")}
          </button>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-secondary px-3 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
            disabled={isSaving}
            type="button"
            onClick={() => void saveDefaultWorkingFolder()}
          >
            {isSaving ? t("saving") : t("save")}
          </button>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            disabled={!settings.defaultWorkingFolder || isSaving}
            type="button"
            onClick={() => void openDefaultWorkingFolder()}
          >
            {t("openFolder")}
          </button>
        </div>
        {saveState !== "idle" && (
          <p className={cn("motion-status mt-3 text-xs", saveState === "saved" ? "text-emerald-600" : "text-destructive")}>
            {saveState === "saved" ? t("saved") : t("operationFailed")}
          </p>
        )}
      </section>

      <section className="motion-surface rounded-lg border border-border bg-card/70 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <ArchiveRestore className="size-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">{t("recoveryCenter")}</h2>
            <p className="text-sm text-muted-foreground">{t("recoveryCenterHint")}</p>
          </div>
        </div>
        <div className="grid gap-3">
          <RecoveryGroup
            emptyLabel={t("emptyDeletedTasks")}
            items={data.deletedTasks.map((task) => ({ id: task.id, title: task.title, meta: task.dueDate }))}
            title={t("deletedTasks")}
            onRestore={(id) => actions.restoreTask(id)}
          />
          <RecoveryGroup
            emptyLabel={t("emptyDeletedFolders")}
            items={data.deletedWorkspaceFolders.map((folder) => ({ id: folder.id, title: folder.name, meta: folder.path }))}
            title={t("deletedFolders")}
            onRestore={(id) => actions.restoreWorkspaceFolder(id)}
          />
          <RecoveryGroup
            emptyLabel={t("emptyArchivedProjects")}
            items={data.projects
              .filter((project) => project.status === "archived" && project.deletedAt === null)
              .map((project) => ({ id: project.id, title: project.name, meta: project.dueDate ?? t("none") }))}
            title={t("archivedProjects")}
            onRestore={(id) => actions.unarchiveProject(id)}
          />
        </div>
      </section>

      <section className="motion-surface rounded-lg border border-border bg-card/70 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Database className="size-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">{t("dataManagement")}</h2>
            <p className="text-sm text-muted-foreground">{t("dataManagementHint")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90" type="button" onClick={() => void exportBackup()}>
            <Download className="size-4" />
            {t("exportBackup")}
          </button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium hover:bg-accent" type="button" onClick={() => void importBackup()}>
            <Upload className="size-4" />
            {t("importBackup")}
          </button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium hover:bg-accent" type="button" onClick={() => void exportCsv()}>
            <Download className="size-4" />
            {t("exportCsv")}
          </button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-secondary px-3 text-sm font-medium hover:bg-accent" type="button" onClick={() => void exportIcs()}>
            <Download className="size-4" />
            {t("exportIcs")}
          </button>
        </div>
        {dataState !== "idle" && (
          <p className={cn("motion-status mt-3 text-xs", dataState === "saved" ? "text-emerald-600" : "text-destructive")}>
            {dataState === "saved" ? t("dataOperationDone") : t("operationFailed")}
          </p>
        )}
      </section>

      <UpdateSettingsPanel />
    </main>
  );
}

function RecoveryGroup({
  emptyLabel,
  items,
  title,
  onRestore,
}: {
  emptyLabel: string;
  items: { id: string; title: string; meta: string }[];
  title: string;
  onRestore: (id: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-md border border-border bg-background/45 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="grid gap-2">
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border bg-card/70 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.meta}</p>
              </div>
              <button
                className="inline-flex h-8 items-center rounded-md border border-border bg-secondary px-2.5 text-sm font-medium hover:bg-accent"
                type="button"
                onClick={() => void onRestore(item.id)}
              >
                {t("restore")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Segmented({
  disabled = false,
  options,
  value,
  onChange,
}: {
  disabled?: boolean;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-grid grid-flow-col gap-1 rounded-lg border border-border bg-background/55 p-1">
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          key={option.value}
          className={cn(
            "h-8 rounded-md px-3 text-sm transition-[background-color,color,transform] duration-150 ease-[var(--ease-out-quart)] hover:bg-accent active:scale-95 disabled:opacity-50",
            value === option.value && "bg-primary text-primary-foreground hover:bg-primary",
          )}
          disabled={disabled}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({
  checked,
  disabled = false,
  label,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-checked={checked}
      className="motion-surface flex items-center justify-between rounded-md border border-border bg-background/45 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
      disabled={disabled}
      role="switch"
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
