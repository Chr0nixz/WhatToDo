import * as Dialog from "@radix-ui/react-dialog";
import { Keyboard, Wand2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

export interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings: () => void;
}

export function HelpDialog({
  open,
  onOpenChange,
  onOpenSettings,
}: HelpDialogProps) {
  const { t } = useTranslation();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  const mod = isMac ? "\u2318" : "Ctrl";
  const shortcuts: Array<[string, string]> = [
    [t("shortcutOpenPalette"), `${mod} + K`],
    [t("shortcutNewTask"), `${mod} + N`],
    [t("shortcutSearchTasks"), `${mod} + Shift + F`],
    [t("shortcutNextTask"), "j"],
    [t("shortcutPrevTask"), "k"],
    [t("shortcutSaveTask"), `${mod} + S`],
    [t("shortcutSwitchScope"), "\u2190 / \u2192"],
    [t("undo"), `${mod} + Z`],
    [t("shortcutHelp"), "?"],
    [t("close"), "Esc"],
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="motion-dialog-overlay fixed inset-0 z-50 bg-background/65 backdrop-blur-[2px]" />
        <Dialog.Content className="motion-dialog-content fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-5 text-popover-foreground shadow-xl outline-none">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">{t("help")}</Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">{t("helpHint")}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button aria-label={t("close")} size="icon-sm" type="button" variant="ghost" title={t("close")}>
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="grid max-h-[60vh] gap-4 overflow-auto">
            <div className="rounded-md bg-background/50 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Keyboard className="size-4 text-muted-foreground" />
                {t("keyboardShortcuts")}
              </div>
              <dl className="grid gap-1.5 text-sm">
                {shortcuts.map(([label, keys]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd>
                      <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 text-xs">{keys}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="rounded-md bg-background/50 p-3">
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

          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => {
                onOpenSettings();
                onOpenChange(false);
              }}
            >
              {t("helpOpenSettings")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
