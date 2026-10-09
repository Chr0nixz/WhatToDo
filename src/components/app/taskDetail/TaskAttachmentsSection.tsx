import { FolderOpen, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import { openManagedAttachment } from "@/lib/openLocalPath";
import type { Attachment } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

export interface TaskAttachmentsSectionProps {
  taskAttachments: Attachment[];
  attachmentErrorId: string | null;
  attachmentCopyError: string | null;
  newAttachmentPath: string;
  isSaving: boolean;
  actions: TodoActions;
  setAttachmentErrorId: (id: string | null) => void;
  setNewAttachmentPath: (path: string) => void;
  chooseAttachmentFile: () => void | Promise<void>;
  addAttachmentFromPath: () => void | Promise<void>;
}

export function TaskAttachmentsSection({
  taskAttachments,
  attachmentErrorId,
  attachmentCopyError,
  newAttachmentPath,
  isSaving,
  actions,
  setAttachmentErrorId,
  setNewAttachmentPath,
  chooseAttachmentFile,
  addAttachmentFromPath,
}: TaskAttachmentsSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-xs font-medium">
        <span>{t("attachments")}</span>
        <span className="text-muted-foreground">{taskAttachments.length}</span>
      </div>
      {taskAttachments.length > 0 && (
        <div className="grid gap-1">
          {taskAttachments.map((item) => (
            <div key={item.id} className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <button
                  className="min-w-0 truncate text-left text-foreground hover:underline"
                  type="button"
                  title={item.path}
                  onClick={() => {
                    void openManagedAttachment(item.path).catch(() => {
                      setAttachmentErrorId(item.id);
                    });
                  }}
                >
                  {item.filename}
                </button>
                <div className="flex items-center gap-1">
                  {attachmentErrorId === item.id && (
                    <Button
                      disabled={isSaving}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => {
                        void (async () => {
                          const selected = await openDialog({
                            multiple: false,
                            title: t("relocateAttachment"),
                          });
                          if (typeof selected !== "string" || !selected) {
                            return;
                          }
                          const filename = selected.split(/[/\\]/).pop() ?? item.filename;
                          await actions.updateAttachmentPath(item.id, selected, filename);
                          setAttachmentErrorId(null);
                        })();
                      }}
                    >
                      {t("relocateAttachment")}
                    </Button>
                  )}
                  <Button
                    aria-label={t("removeAttachment")}
                    disabled={isSaving}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => void actions.deleteAttachment(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              {attachmentErrorId === item.id && (
                <p className="text-xs text-destructive" role="alert">
                  {t("attachmentOpenFailed")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_36px_auto] gap-1.5">
        <div className="min-w-0">
          <label className="sr-only" htmlFor="detail-attachment-path">
            {t("attachmentPath")}
          </label>
          <input
            id="detail-attachment-path"
            className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
            placeholder={t("attachmentPathPlaceholder")}
            value={newAttachmentPath}
            onChange={(event) => setNewAttachmentPath(event.target.value)}
          />
        </div>
        <Button
          aria-label={t("chooseFile")}
          disabled={isSaving}
          size="icon-lg"
          title={t("chooseFile")}
          type="button"
          variant="secondary"
          onClick={() => void chooseAttachmentFile()}
        >
          <FolderOpen aria-hidden="true" />
        </Button>
        <Button
          disabled={isSaving || !newAttachmentPath.trim()}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void addAttachmentFromPath()}
        >
          {t("addAttachment")}
        </Button>
      </div>
      {attachmentCopyError && (
        <p className="text-xs text-destructive" role="alert">
          {attachmentCopyError}
        </p>
      )}
    </div>
  );
}
