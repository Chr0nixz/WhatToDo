export const TASK_DRAG_MIME = "application/x-whattodo-task-id";

export type RescheduleDropInput = {
  taskId: string;
  nextDueDate: string;
  currentDueDate: string | null | undefined;
};

export type RescheduleDropResult =
  | { kind: "noop" }
  | { kind: "apply"; taskId: string; previousDueDate: string; nextDueDate: string };

export const planRescheduleDrop = (input: RescheduleDropInput): RescheduleDropResult => {
  if (!input.currentDueDate || input.currentDueDate === input.nextDueDate) {
    return { kind: "noop" };
  }
  return {
    kind: "apply",
    taskId: input.taskId,
    previousDueDate: input.currentDueDate,
    nextDueDate: input.nextDueDate,
  };
};
