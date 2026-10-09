import { Plus } from "lucide-react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { accentSwatches } from "@/data/accentSwatches";
import { cn } from "@/lib/utils";

export interface WorkspaceCreateFormProps {
  workspaceName: string;
  workspaceColor: string;
  isCreatingWorkspace: boolean;
  workspaceError: string | null;
  onNameChange: (val: string) => void;
  onColorChange: (val: string) => void;
  onSubmit: (e: FormEvent) => void;
}

export function WorkspaceCreateForm({
  workspaceName,
  workspaceColor,
  isCreatingWorkspace,
  workspaceError,
  onNameChange,
  onColorChange,
  onSubmit,
}: WorkspaceCreateFormProps) {
  const { t } = useTranslation();

  return (
    <form className="mt-3" onSubmit={onSubmit}>
      <h2 className="mb-3 text-sm font-semibold">{t("createWorkspace")}</h2>
      <label className="mb-1 block text-xs text-muted-foreground" htmlFor="workspace-name">
        {t("workspaceName")}
      </label>
      <input
        id="workspace-name"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
        value={workspaceName}
        onChange={(event) => onNameChange(event.target.value)}
      />
      <div className="mt-3 flex gap-2">
        {accentSwatches.map((item) => (
          <button
            key={item.value}
            aria-label={t(item.labelKey)}
            aria-pressed={workspaceColor === item.value}
            className={cn(
              "size-7 rounded-md border border-border ring-offset-background transition-[box-shadow,border-color] duration-150 ease-[var(--ease-out-quart)]",
              workspaceColor === item.value && "ring-2 ring-ring",
            )}
            style={{ backgroundColor: item.value }}
            type="button"
            onClick={() => onColorChange(item.value)}
          />
        ))}
      </div>
      <Button className="mt-4 w-full" disabled={isCreatingWorkspace} type="submit">
        <Plus />
        {isCreatingWorkspace ? t("creating") : t("createWorkspace")}
      </Button>
      {workspaceError && <p className="mt-2 text-xs text-destructive">{workspaceError}</p>}
    </form>
  );
}
