import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { Project } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";
import { cn } from "@/lib/utils";

const projectColors = [
  { labelKey: "accentBlue", value: "#4fb8d8" },
  { labelKey: "accentViolet", value: "#8b7cf6" },
  { labelKey: "accentRose", value: "#ec6f5d" },
  { labelKey: "accentEmerald", value: "#6cc083" },
  { labelKey: "accentAmber", value: "#d7a742" },
];

type ProjectEditDialogProps = {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: TodoActions;
};

export function ProjectEditDialog({ project, open, onOpenChange, actions }: ProjectEditDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [color, setColor] = useState(projectColors[0].value);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project || !open) {
      return;
    }

    setName(project.name);
    setDueDate(project.dueDate ?? "");
    setColor(project.color);
    setError(null);
  }, [open, project]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!project) {
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
      await actions.updateProject(project.id, {
        name: trimmed,
        color,
        dueDate: dueDate || null,
      });
      onOpenChange(false);
    } catch {
      setError(t("operationFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  if (!project) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-dialog-overlay fixed inset-0 z-50 bg-background/65 backdrop-blur-[2px]" />
        <Dialog.Content className="motion-dialog-content fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">{t("editProject")}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">{project.name}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button aria-label={t("close")} size="icon-sm" type="button" variant="ghost" title={t("close")}>
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          <form className="grid gap-3" onSubmit={save}>
            <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="edit-project-name">
              <span>{t("projectName")}</span>
              <input
                id="edit-project-name"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="edit-project-due">
              <span>{t("projectDue")}</span>
              <input
                id="edit-project-due"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
            <div className="flex gap-2">
              {projectColors.map((item) => (
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
            <Button className="mt-1 w-fit" disabled={isSaving} type="submit">
              {isSaving ? t("saving") : t("save")}
            </Button>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
