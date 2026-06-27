import * as Dialog from "@radix-ui/react-dialog";
import { Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { Workspace } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

const workspaceColors = [
  { labelKey: "accentBlue", value: "#4fb8d8" },
  { labelKey: "accentEmerald", value: "#6cc083" },
  { labelKey: "accentAmber", value: "#d7a742" },
  { labelKey: "accentRose", value: "#ec6f5d" },
  { labelKey: "accentViolet", value: "#8b7cf6" },
];

type WorkspaceEditDialogProps = {
  workspace: Workspace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: TodoActions;
  onDelete?: (workspaceId: string) => void | Promise<void>;
};

export function WorkspaceEditDialog({ workspace, open, onOpenChange, actions, onDelete }: WorkspaceEditDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [color, setColor] = useState(workspaceColors[0].value);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace || !open) {
      return;
    }

    setName(workspace.name);
    setColor(workspace.color);
    setError(null);
  }, [open, workspace]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspace) {
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("nameRequired"));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await actions.updateWorkspace(workspace.id, { name: trimmed, color });
      onOpenChange(false);
    } catch {
      setError(t("workspaceUpdateFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async () => {
    if (!workspace || !onDelete) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await onDelete(workspace.id);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message === "CANNOT_DELETE_LAST_WORKSPACE" ? t("cannotDeleteLastWorkspace") : t("workspaceUpdateFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!workspace) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-dialog-overlay fixed inset-0 z-50 bg-background/65 backdrop-blur-[2px]" />
        <Dialog.Content className="motion-dialog-content fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">{t("editWorkspace")}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">{workspace.name}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button aria-label={t("close")} size="icon-sm" type="button" variant="ghost" title={t("close")}>
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          <form className="grid gap-3" onSubmit={save}>
            <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="edit-workspace-name">
              <span>{t("workspaceName")}</span>
              <input
                id="edit-workspace-name"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="flex gap-2">
              {workspaceColors.map((item) => (
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
                  onClick={() => setColor(item.value)}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button disabled={isSaving} type="submit">
                {isSaving ? t("saving") : t("save")}
              </Button>
              {onDelete && (
                <Button disabled={isDeleting} type="button" variant="ghost" onClick={() => void remove()}>
                  <Trash2 />
                  {isDeleting ? t("deleting") : t("deleteWorkspace")}
                </Button>
              )}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
