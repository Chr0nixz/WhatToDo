import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { ArchiveRestore, Bell, Check, Database, Download, FolderOpen, HelpCircle, Keyboard, Languages, Moon, Palette, RotateCw, Upload, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { accentSwatches } from "@/data/accentSwatches";
import {
  restoreAttachmentSidecar,
  writeBackupBundle,
  cleanupAutoBackupFiles,
  prepareBackupExport,
} from "@/data/backupAttachments";
import type { AccentColor, AppData, BackupPayload, ImportBackupMode, Language, RecoveryItems, Settings, ThemeMode } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import {
  AUTO_BACKUP_LAST_ERROR_KEY,
  applyAutoBackupPreferencesFromBackup,
  loadAutoBackupConfig,
  loadAutoBackupLastError,
  saveAutoBackupConfig,
  toAutoBackupPreferences,
  type AutoBackupConfig,
} from "@/hooks/useAutoBackup";
import { cn } from "@/lib/utils";
import { ImportPreviewDialog } from "./ImportPreviewDialog";
import { UpdateSettingsPanel } from "./UpdateSettingsPanel";
import { formatTaskDate } from "@/data/dateFormat";

type SettingsViewProps = {
  data: AppData;
  actions: TodoActions;
};

const accentOptions = accentSwatches.map((swatch) => ({
  value: swatch.id,
  labelKey: swatch.labelKey,
  swatch: swatch.value,
})) satisfies { value: AccentColor; labelKey: string; swatch: string }[];

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
  const [reminderOffsetInput, setReminderOffsetInput] = useState(String(settings.defaultReminderOffset));
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [dataState, setDataState] = useState<"idle" | "saved" | "error">("idle");
  const [dataError, setDataError] = useState<string | null>(null);
  const [isMigratingAttachments, setIsMigratingAttachments] = useState(false);
  const [recoveryItems, setRecoveryItems] = useState<RecoveryItems>({
    deletedTasks: [],
    deletedWorkspaceFolders: [],
    deletedWorkspaces: [],
    archivedProjects: [],
  });
  const [recoveryState, setRecoveryState] = useState<"loading" | "ready" | "error">("loading");
  const [importPreview, setImportPreview] = useState<{
    open: boolean;
    payload: unknown;
    sourcePath: string | null;
  }>({ open: false, payload: null, sourcePath: null });
  const [autoBackup, setAutoBackup] = useState<AutoBackupConfig>(() => loadAutoBackupConfig());
  const [autoBackupState, setAutoBackupState] = useState<"idle" | "settings_saved" | "backup_done" | "error">("idle");
  const [autoBackupFeedback, setAutoBackupFeedback] = useState<string | null>(null);
  const reminderOffsetTimer = useRef<number | null>(null);

  useEffect(() => {
    setDefaultWorkingFolder(settings.defaultWorkingFolder ?? "");
    setReminderOffsetInput(String(settings.defaultReminderOffset));
  }, [settings.defaultWorkingFolder, settings.defaultReminderOffset]);

  useEffect(() => {
    if (reminderOffsetTimer.current !== null) {
      window.clearTimeout(reminderOffsetTimer.current);
    }
    const trimmed = reminderOffsetInput.trim();
    if (trimmed === "") {
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    if (parsed === settings.defaultReminderOffset) {
      return;
    }
    reminderOffsetTimer.current = window.setTimeout(() => {
      void saveSettings({ defaultReminderOffset: Math.floor(parsed) });
    }, 600);
    return () => {
      if (reminderOffsetTimer.current !== null) {
        window.clearTimeout(reminderOffsetTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderOffsetInput]);

  const loadRecoveryItems = async () => {
    setRecoveryState("loading");

    try {
      setRecoveryItems(await actions.loadRecoveryItems());
      setRecoveryState("ready");
    } catch {
      setRecoveryState("error");
    }
  };

  useEffect(() => {
    void loadRecoveryItems();
  }, [data.workspaceId]);

  const restoreRecoveryItem = async (restore: () => Promise<unknown>) => {
    await restore();
    await loadRecoveryItems();
  };

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
      try {
        await openPath(folder);
        setSaveState("idle");
      } catch {
        setSaveState("error");
      }
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
    setDataError(null);
    try {
      const payload = await actions.exportBackup();
      const prepared = prepareBackupExport(payload, {
        clientPreferences: { autoBackup: toAutoBackupPreferences(loadAutoBackupConfig()) },
      });
      const contents = JSON.stringify(prepared.payload, null, 2);
      if (!isTauriRuntime()) {
        downloadText(`whattodo-backup-${timestampForFile()}.json`, contents, "application/json");
        setDataState("saved");
        return;
      }

      const path = await saveDialog({
        defaultPath: `whattodo-backup-${timestampForFile()}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof path !== "string") {
        return;
      }
      await writeBackupBundle(path, payload, {
        clientPreferences: { autoBackup: toAutoBackupPreferences(loadAutoBackupConfig()) },
      });
      setDataState("saved");
    } catch (err) {
      setDataState("error");
      setDataError(`${t("exportFailed")}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const importBackup = async () => {
    if (!isTauriRuntime()) {
      setDataState("error");
      setDataError(t("importFailed"));
      return;
    }

    setDataState("idle");
    setDataError(null);
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
      try {
        await writeBackupBundle(preImportPath, currentBackup, {
          clientPreferences: { autoBackup: toAutoBackupPreferences(loadAutoBackupConfig()) },
        });
      } catch {
        throw new Error(t("preImportBackupFailed"));
      }

      const contents = await invoke<string>("read_text_file", { path: selected });
      let parsed: unknown;
      try {
        parsed = JSON.parse(contents);
      } catch {
        throw new Error(t("importInvalidJson"));
      }
      setImportPreview({ open: true, payload: parsed, sourcePath: selected });
    } catch (err) {
      setDataState("error");
      const message = err instanceof Error ? err.message : String(err);
      const isKnown = message === t("importInvalidJson") || message === t("preImportBackupFailed");
      setDataError(isKnown ? message : `${t("importFailed")}: ${message}`);
    }
  };

  const confirmImportBackup = async (payload: BackupPayload, mode: ImportBackupMode) => {
    try {
      const sourcePath = importPreview.sourcePath;
      let nextPayload = payload;
      if (sourcePath) {
        nextPayload = await restoreAttachmentSidecar(sourcePath, payload);
      }
      if (nextPayload.whattodoBackupVersion === 3 && nextPayload.clientPreferences?.autoBackup) {
        applyAutoBackupPreferencesFromBackup(nextPayload.clientPreferences.autoBackup);
        setAutoBackup(loadAutoBackupConfig());
      }
      await actions.importBackup(nextPayload, mode);
      setImportPreview({ open: false, payload: null, sourcePath: null });
      setDataState("saved");
    } catch (err) {
      setDataState("error");
      setDataError(`${t("importFailed")}: ${err instanceof Error ? err.message : String(err)}`);
      setImportPreview({ open: false, payload: null, sourcePath: null });
    }
  };

  const exportCsv = async () => {
    setDataState("idle");
    setDataError(null);
    try {
      await writeText(`whattodo-tasks-${timestampForFile()}.csv`, await actions.exportCurrentWorkspaceCsv(), "text/csv");
      setDataState("saved");
    } catch (err) {
      setDataState("error");
      setDataError(`${t("exportFailed")}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const exportIcs = async () => {
    setDataState("idle");
    setDataError(null);
    try {
      await writeText(`whattodo-tasks-${timestampForFile()}.ics`, await actions.exportCurrentWorkspaceIcs(), "text/calendar");
      setDataState("saved");
    } catch (err) {
      setDataState("error");
      setDataError(`${t("exportFailed")}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const migrateAttachments = async () => {
    setDataState("idle");
    setDataError(null);
    if (!isTauriRuntime()) {
      setDataState("error");
      setDataError(t("migrateAttachmentsDesktopOnly"));
      return;
    }
    setIsMigratingAttachments(true);
    try {
      const { report } = await actions.migrateExternalAttachments();
      setDataState("saved");
      setDataError(
        t("migrateAttachmentsReport", {
          migrated: report.migrated,
          skipped: report.skipped,
          failed: report.failed,
        }),
      );
    } catch (err) {
      setDataState("error");
      setDataError(err instanceof Error ? err.message : t("operationFailed"));
    } finally {
      setIsMigratingAttachments(false);
    }
  };

  const updateAutoBackup = (patch: Partial<AutoBackupConfig>) => {
    const next = { ...autoBackup, ...patch };
    if (next.enabled && !next.folder) {
      setAutoBackupFeedback(t("autoBackupFolderRequired"));
      setAutoBackupState("error");
      window.setTimeout(() => {
        setAutoBackupState("idle");
        setAutoBackupFeedback(null);
      }, 3000);
      return;
    }
    setAutoBackup(next);
    saveAutoBackupConfig(next);
    setAutoBackupFeedback(null);
    setAutoBackupState("settings_saved");
    window.setTimeout(() => setAutoBackupState("idle"), 2000);
  };

  const chooseAutoBackupFolder = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t("autoBackupFolder"),
    });
    if (typeof selected === "string") {
      updateAutoBackup({ folder: selected });
    }
  };

  const runAutoBackupNow = async () => {
    setAutoBackupState("idle");
    setAutoBackupFeedback(null);
    try {
      const payload = await actions.exportBackup();
      const filename = `whattodo-auto-${timestampForFile()}.json`;
      const folder = autoBackup.folder;
      if (!folder) {
        setAutoBackupFeedback(t("autoBackupFolderRequired"));
        setAutoBackupState("error");
        return;
      }
      const path = await invoke<string>("join_backup_path", { folder, filename });
      await writeBackupBundle(path, payload, {
        clientPreferences: { autoBackup: toAutoBackupPreferences(autoBackup) },
      });
      try {
        await cleanupAutoBackupFiles(folder, autoBackup.retentionCount, autoBackup.retentionDays);
      } catch {
        // Retention is best-effort after a successful write.
      }
      localStorage.setItem("whattodo:auto-backup:last-run", String(Date.now()));
      localStorage.removeItem(AUTO_BACKUP_LAST_ERROR_KEY);
      setAutoBackupState("backup_done");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      localStorage.setItem(AUTO_BACKUP_LAST_ERROR_KEY, message);
      setAutoBackupFeedback(message);
      setAutoBackupState("error");
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-4xl gap-4">
      <section className="motion-surface rounded-lg border border-border bg-card/65 p-4 shadow-sm">
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
          <div className="grid gap-2 rounded-md bg-background/50 px-3 py-3">
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
                      className="flex size-4 items-center justify-center rounded-full border border-border"
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

      <section className="motion-surface rounded-lg border border-border bg-card/65 p-4 shadow-sm">
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

      <section className="motion-surface rounded-lg border border-border bg-card/65 p-4 shadow-sm">
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
          <label className="grid grid-cols-[1fr_160px] items-center gap-3 rounded-md bg-background/50 px-3 py-2 text-sm">
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
              value={reminderOffsetInput}
              onChange={(event) => setReminderOffsetInput(event.target.value)}
              aria-invalid={reminderOffsetInput.trim() !== "" && (!Number.isFinite(Number(reminderOffsetInput)) || Number(reminderOffsetInput) < 0)}
            />
            {reminderOffsetInput.trim() !== "" && (!Number.isFinite(Number(reminderOffsetInput)) || Number(reminderOffsetInput) < 0) && (
              <p className="text-xs text-destructive">{t("invalidReminderOffset")}</p>
            )}
          </label>
        </div>
      </section>

      <section className="motion-surface rounded-lg border border-border bg-card/65 p-4 shadow-sm">
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
          <Button
            disabled={isSaving}
            size="lg"
            type="button"
            variant="secondary"
            onClick={() => void chooseDefaultWorkingFolder()}
          >
            <FolderOpen className="size-4" />
            {t("chooseFolder")}
          </Button>
          <Button
            disabled={isSaving}
            size="lg"
            type="button"
            variant="secondary"
            onClick={() => void saveDefaultWorkingFolder()}
          >
            {isSaving ? t("saving") : t("save")}
          </Button>
          <Button
            disabled={!settings.defaultWorkingFolder || isSaving}
            size="lg"
            type="button"
            onClick={() => void openDefaultWorkingFolder()}
          >
            {t("openFolder")}
          </Button>
        </div>
        {saveState !== "idle" && (
          <p className={cn("motion-status mt-3 text-xs", saveState === "saved" ? "text-success" : "text-destructive")}>
            {saveState === "saved" ? t("saved") : t("operationFailed")}
          </p>
        )}
      </section>

      <section className="motion-surface rounded-lg border border-border bg-card/65 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <ArchiveRestore className="size-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">{t("recoveryCenter")}</h2>
            <p className="text-sm text-muted-foreground">{t("recoveryCenterHint")}</p>
          </div>
        </div>
        {recoveryState === "loading" ? (
          <p className="motion-status rounded-md border border-dashed border-border bg-background/50 p-3 text-sm text-muted-foreground">
            {t("loadingRecovery")}
          </p>
        ) : recoveryState === "error" ? (
          <p className="motion-status rounded-md border border-dashed border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {t("loadRecoveryFailed")}
          </p>
        ) : (
          <div className="grid gap-3">
            <RecoveryGroup
              emptyLabel={t("emptyDeletedTasks")}
              items={recoveryItems.deletedTasks.map((task) => ({
                id: task.id,
                title: task.title,
                meta: formatTaskDate(task.dueDate, i18n.language),
              }))}
              title={t("deletedTasks")}
              onRestore={(id) => restoreRecoveryItem(() => actions.restoreTask(id))}
            />
            <RecoveryGroup
              emptyLabel={t("emptyDeletedFolders")}
              items={recoveryItems.deletedWorkspaceFolders.map((folder) => ({ id: folder.id, title: folder.name, meta: folder.path }))}
              title={t("deletedFolders")}
              onRestore={(id) => restoreRecoveryItem(() => actions.restoreWorkspaceFolder(id))}
            />
            <RecoveryGroup
              emptyLabel={t("emptyDeletedWorkspaces")}
              items={recoveryItems.deletedWorkspaces.map((workspace) => ({
                id: workspace.id,
                title: workspace.name,
                meta: t("workspaces"),
              }))}
              title={t("deletedWorkspaces")}
              onRestore={(id) => restoreRecoveryItem(() => actions.restoreWorkspace(id))}
            />
            <RecoveryGroup
              emptyLabel={t("emptyArchivedProjects")}
              items={recoveryItems.archivedProjects.map((project) => ({
                id: project.id,
                title: project.name,
                meta: project.dueDate ? formatTaskDate(project.dueDate, i18n.language) : t("none"),
              }))}
              title={t("archivedProjects")}
              onRestore={(id) => restoreRecoveryItem(() => actions.unarchiveProject(id))}
            />
          </div>
        )}
      </section>

      <section className="motion-surface rounded-lg border border-border bg-card/65 p-4 shadow-sm">
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
          <Button size="lg" type="button" onClick={() => void exportBackup()}>
            <Download className="size-4" />
            {t("exportBackup")}
          </Button>
          <Button size="lg" type="button" variant="secondary" onClick={() => void importBackup()}>
            <Upload className="size-4" />
            {t("importBackup")}
          </Button>
          <Button size="lg" type="button" variant="secondary" onClick={() => void exportCsv()}>
            <Download className="size-4" />
            {t("exportCsv")}
          </Button>
          <Button size="lg" type="button" variant="secondary" onClick={() => void exportIcs()}>
            <Download className="size-4" />
            {t("exportIcs")}
          </Button>
          <Button
            disabled={isMigratingAttachments}
            size="lg"
            title={t("migrateAttachmentsHint")}
            type="button"
            variant="secondary"
            onClick={() => void migrateAttachments()}
          >
            <FolderOpen className="size-4" />
            {isMigratingAttachments ? t("migrateAttachmentsRunning") : t("migrateAttachments")}
          </Button>
        </div>
        {dataState !== "idle" && (
          <p className={cn("motion-status mt-3 text-xs", dataState === "saved" ? "text-success" : "text-destructive")}>
            {dataState === "saved"
              ? dataError ?? t("dataOperationDone")
              : dataError ?? t("operationFailed")}
          </p>
        )}
      </section>

      <section className="motion-surface rounded-lg border border-border bg-card/65 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <RotateCw className="size-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">{t("autoBackup")}</h2>
            <p className="text-sm text-muted-foreground">{t("autoBackupHint")}</p>
          </div>
        </div>
        <div className="grid gap-3">
          <ToggleRow
            checked={autoBackup.enabled}
            label={t("autoBackupEnabled")}
            onClick={() => updateAutoBackup({ enabled: !autoBackup.enabled })}
          />
          <label className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-md bg-background/50 px-3 py-2 text-sm">
            <span>
              <span className="block font-medium">{t("autoBackupInterval")}</span>
              <span className="text-xs text-muted-foreground">{t("hours")}</span>
            </span>
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-50"
              disabled={!autoBackup.enabled}
              min={1}
              step={1}
              type="number"
              value={autoBackup.intervalHours}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed) && parsed >= 1) {
                  updateAutoBackup({ intervalHours: Math.floor(parsed) });
                }
              }}
            />
          </label>
          <label className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-md bg-background/50 px-3 py-2 text-sm">
            <span>
              <span className="block font-medium">{t("autoBackupRetentionCount")}</span>
              <span className="text-xs text-muted-foreground">{t("autoBackupRetentionCountHint")}</span>
            </span>
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-50"
              disabled={!autoBackup.enabled}
              min={1}
              step={1}
              type="number"
              value={autoBackup.retentionCount}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed) && parsed >= 1) {
                  updateAutoBackup({ retentionCount: Math.floor(parsed) });
                }
              }}
            />
          </label>
          <label className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-md bg-background/50 px-3 py-2 text-sm">
            <span>
              <span className="block font-medium">{t("autoBackupRetentionDays")}</span>
              <span className="text-xs text-muted-foreground">{t("autoBackupRetentionDaysHint")}</span>
            </span>
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-50"
              disabled={!autoBackup.enabled}
              min={1}
              step={1}
              type="number"
              value={autoBackup.retentionDays}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isFinite(parsed) && parsed >= 1) {
                  updateAutoBackup({ retentionDays: Math.floor(parsed) });
                }
              }}
            />
          </label>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 max-sm:grid-cols-1">
            <input
              className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-50"
              disabled={!autoBackup.enabled}
              placeholder="D:\\Backups\\..."
              value={autoBackup.folder ?? ""}
              readOnly
            />
            <Button
              disabled={!autoBackup.enabled}
              size="lg"
              type="button"
              variant="secondary"
              onClick={() => void chooseAutoBackupFolder()}
            >
              <FolderOpen className="size-4" />
              {t("chooseFolder")}
            </Button>
            <Button
              disabled={!autoBackup.enabled || !autoBackup.folder}
              size="lg"
              type="button"
              onClick={() => void runAutoBackupNow()}
            >
              {t("autoBackupRunNow")}
            </Button>
          </div>
          {autoBackupState !== "idle" && (
            <p
              className={cn(
                "motion-status text-xs",
                autoBackupState === "error" ? "text-destructive" : "text-success",
              )}
            >
              {autoBackupState === "settings_saved"
                ? t("autoBackupSettingsSaved")
                : autoBackupState === "backup_done"
                  ? t("autoBackupDone")
                  : (autoBackupFeedback ?? t("autoBackupFailed"))}
            </p>
          )}
          {autoBackupState === "idle" && loadAutoBackupLastError() && (
            <p className="motion-status text-xs text-destructive">
              {t("autoBackupLastError")}: {loadAutoBackupLastError()}
            </p>
          )}
        </div>
      </section>

      <section className="motion-surface rounded-lg border border-border bg-card/65 p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <HelpCircle className="size-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">{t("help")}</h2>
            <p className="text-sm text-muted-foreground">{t("helpHint")}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="p-1">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Keyboard className="size-4 text-muted-foreground" />
              {t("keyboardShortcuts")}
            </div>
            <dl className="grid gap-1.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("shortcutOpenPalette")}</dt>
                <dd><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-xs">⌘/Ctrl + K</kbd></dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("shortcutNewTask")}</dt>
                <dd><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-xs">⌘/Ctrl + N</kbd></dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted-foreground">{t("shortcutSearchTasks")}</dt>
                <dd><kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-xs">⌘/Ctrl + Shift + F</kbd></dd>
              </div>
            </dl>
          </div>
          <div className="p-1">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Wand2 className="size-4 text-muted-foreground" />
              {t("quickAddSyntax")}
            </div>
            <p className="mb-2 text-xs text-muted-foreground">{t("quickAddSyntaxHint")}</p>
            <ul className="grid gap-1 text-xs text-muted-foreground">
              <li>{t("quickAddDateDesc")}</li>
              <li>{t("quickAddTimeDesc")}</li>
              <li>{t("quickAddProjectDesc")}</li>
              <li>{t("quickAddPriorityDesc")}</li>
              <li>{t("quickAddReminderDesc")}</li>
            </ul>
            <p className="mt-3 mb-1 text-xs font-medium text-foreground">{t("quickAddExamples")}</p>
            <ul className="grid gap-1 text-xs text-muted-foreground">
              <li className="rounded border border-border bg-background px-2 py-1 font-mono">{t("quickAddExample1")}</li>
              <li className="rounded border border-border bg-background px-2 py-1 font-mono">{t("quickAddExample2")}</li>
            </ul>
          </div>
        </div>
      </section>

      <UpdateSettingsPanel />

      <ImportPreviewDialog
        currentData={data}
        open={importPreview.open}
        rawPayload={importPreview.payload}
        onOpenChange={(open) => setImportPreview((prev) => ({ ...prev, open }))}
        onConfirm={(payload, mode) => void confirmImportBackup(payload, mode)}
      />
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
    <div className="rounded-md bg-background/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="grid gap-2">
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-card/65 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.meta}</p>
              </div>
              <Button
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => void onRestore(item.id)}
              >
                {t("restore")}
              </Button>
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
    <div className="inline-grid grid-flow-col gap-1 rounded-lg border border-border bg-background/50 p-1">
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
      className="motion-surface flex items-center justify-between rounded-md bg-background/50 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
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
