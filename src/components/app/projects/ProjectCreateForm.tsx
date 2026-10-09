import { FolderOpen, Plus } from "lucide-react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { accentSwatches } from "@/data/accentSwatches";
import { cn } from "@/lib/utils";

export interface ProjectCreateFormProps {
  name: string;
  dueDate: string;
  workingFolder: string;
  color: string;
  isCreating: boolean;
  formError: string | null;
  onNameChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onWorkingFolderChange: (value: string) => void;
  onColorChange: (value: string) => void;
  onChooseFolder: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function ProjectCreateForm({
  name,
  dueDate,
  workingFolder,
  color,
  isCreating,
  formError,
  onNameChange,
  onDueDateChange,
  onWorkingFolderChange,
  onColorChange,
  onChooseFolder,
  onSubmit,
}: ProjectCreateFormProps) {
  const { t } = useTranslation();

  return (
    <form className="mt-4 rounded-lg border border-border bg-card/65 p-3" onSubmit={onSubmit}>
      <h2 className="mb-3 text-sm font-semibold">{t("createProject")}</h2>
      <label className="mb-1 block text-xs text-muted-foreground" htmlFor="project-name">
        {t("projectName")}
      </label>
      <input
        id="project-name"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
      />
      <label className="mb-1 mt-3 block text-xs text-muted-foreground" htmlFor="project-due">
        {t("projectDue")}
      </label>
      <input
        id="project-due"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
        type="date"
        value={dueDate}
        onChange={(event) => onDueDateChange(event.target.value)}
      />
      <label className="mb-1 mt-3 block text-xs text-muted-foreground" htmlFor="project-folder">
        {t("workingFolder")}
      </label>
      <div className="flex gap-1.5">
        <input
          id="project-folder"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
          value={workingFolder}
          onChange={(event) => onWorkingFolderChange(event.target.value)}
        />
        <Button
          aria-label={t("chooseFolder")}
          size="icon-lg"
          title={t("chooseFolder")}
          type="button"
          variant="secondary"
          onClick={onChooseFolder}
        >
          <FolderOpen aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-3 flex gap-2">
        {accentSwatches.map((item) => (
          <button
            key={item.value}
            aria-label={t(item.labelKey)}
            aria-pressed={color === item.value}
            className={cn(
              "size-7 rounded-md border border-border ring-offset-background transition-[box-shadow,border-color] duration-150 ease-[var(--ease-out-quart)]",
              color === item.value && "ring-2 ring-ring",
            )}
            style={{ backgroundColor: item.value }}
            type="button"
            onClick={() => onColorChange(item.value)}
          />
        ))}
      </div>
      <Button className="mt-4 w-full" disabled={isCreating} type="submit">
        <Plus />
        {isCreating ? t("creating") : t("createProject")}
      </Button>
      {formError && <p className="mt-2 text-xs text-destructive">{formError}</p>}
    </form>
  );
}
