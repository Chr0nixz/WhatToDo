import type { Project, Task } from "./types";

export const NO_PROJECT_ID = "no-project";

export const visibleProjects = (projects: Project[]) =>
  projects.filter((project) => project.deletedAt === null && project.status !== "archived");

export const tasksForProject = (tasks: Task[], projectId: string | null) =>
  tasks.filter((task) => task.deletedAt === null && task.projectId === projectId);

export const getProjectProgress = (tasks: Task[]) => {
  const visibleTasks = tasks.filter((task) => task.deletedAt === null);
  const completed = visibleTasks.filter((task) => task.status === "completed").length;
  const total = visibleTasks.length;

  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
};

export const projectById = (projects: Project[], projectId: string | null) =>
  projectId ? projects.find((project) => project.id === projectId && project.deletedAt === null) ?? null : null;
