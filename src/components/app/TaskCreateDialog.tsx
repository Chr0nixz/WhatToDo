import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { Project, Settings } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

import { TaskComposer } from "./TaskComposer";

type TaskCreateDialogProps = {
  actions: TodoActions;
  defaultDate: string;
  defaultProjectId?: string | null;
  projects: Project[];
  settings: Settings;
};

export function TaskCreateDialog({
  actions,
  defaultDate,
  defaultProjectId = null,
  projects,
  settings,
}: TaskCreateDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          className="h-10 gap-2 px-4 text-sm font-semibold shadow-sm shadow-primary/25"
          size="lg"
          type="button"
        >
          <Plus className="size-4" />
          {t("add")}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-dialog-overlay fixed inset-0 z-50 bg-background/65 backdrop-blur-[2px]" />
        <Dialog.Content className="motion-dialog-content fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-32px))] rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">{t("add")}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">
                {defaultProjectId ? t("addToProject") : t("addLooseTask")}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button size="icon-sm" type="button" variant="ghost" title={t("close")}>
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <TaskComposer
            actions={actions}
            defaultDate={defaultDate}
            defaultProjectId={defaultProjectId}
            onCreated={() => setOpen(false)}
            projects={projects}
            settings={settings}
            variant="dialog"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
