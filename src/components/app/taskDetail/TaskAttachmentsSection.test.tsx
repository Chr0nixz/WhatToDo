import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TaskAttachmentsSection } from "@/components/app/taskDetail/TaskAttachmentsSection";
import type { Attachment } from "@/data/types";
import type { TodoActions } from "@/hooks/useTodos";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("TaskAttachmentsSection", () => {
  const mockAttachments: Attachment[] = [
    {
      id: "att-1",
      task_id: "task-1",
      filename: "specs.pdf",
      path: "/data/managed_attachments/att-1/specs.pdf",
      mimeType: "application/pdf",
      size: 1024,
      createdAt: "2026-06-01T00:00:00.000Z",
    },
  ];

  const mockActions: TodoActions = {
    deleteAttachment: vi.fn().mockResolvedValue({}),
    updateAttachmentPath: vi.fn().mockResolvedValue({}),
  } as unknown as TodoActions;

  it("renders attachment list and fires deleteAttachment", async () => {
    const handleSetPath = vi.fn();
    const handleChoose = vi.fn();
    const handleAdd = vi.fn();

    render(
      <TaskAttachmentsSection
        actions={mockActions}
        addAttachmentFromPath={handleAdd}
        attachmentCopyError={null}
        attachmentErrorId={null}
        chooseAttachmentFile={handleChoose}
        isSaving={false}
        newAttachmentPath=""
        setAttachmentErrorId={vi.fn()}
        setNewAttachmentPath={handleSetPath}
        taskAttachments={mockAttachments}
      />,
    );

    expect(screen.getByText("specs.pdf")).toBeInTheDocument();

    const deleteBtn = screen.getByLabelText("removeAttachment");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockActions.deleteAttachment).toHaveBeenCalledWith("att-1");
    });
  });

  it("handles choosing file and adding attachment", () => {
    const handleSetPath = vi.fn();
    const handleChoose = vi.fn();
    const handleAdd = vi.fn();

    render(
      <TaskAttachmentsSection
        actions={mockActions}
        addAttachmentFromPath={handleAdd}
        attachmentCopyError={null}
        attachmentErrorId={null}
        chooseAttachmentFile={handleChoose}
        isSaving={false}
        newAttachmentPath="/path/to/file.png"
        setAttachmentErrorId={vi.fn()}
        setNewAttachmentPath={handleSetPath}
        taskAttachments={[]}
      />,
    );

    const chooseBtn = screen.getByLabelText("chooseFile");
    fireEvent.click(chooseBtn);
    expect(handleChoose).toHaveBeenCalledTimes(1);

    const addBtn = screen.getByText("addAttachment");
    fireEvent.click(addBtn);
    expect(handleAdd).toHaveBeenCalledTimes(1);
  });
});
