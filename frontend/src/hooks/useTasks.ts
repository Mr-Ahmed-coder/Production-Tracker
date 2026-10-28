import { useCallback, useEffect, useRef, useState } from "react";
import { type Task } from "../data/demo";
import { api, messageOf } from "../lib/api";
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ tasks: Task[] }>("/tasks", { signal });
      if (alive.current) setTasks(data.tasks);
    } catch (e) {
      if (
        !(e instanceof DOMException && e.name === "AbortError") &&
        alive.current
      )
        setError(messageOf(e));
    } finally {
      if (alive.current && !signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => {
      alive.current = false;
      controller.abort();
    };
  }, [refresh]);
  async function mutate<T>(action: () => Promise<T>): Promise<T> {
    if (lock.current)
      throw new Error("Please wait for the current change to finish.");
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      return await action();
    } catch (e) {
      if (alive.current) setError(messageOf(e));
      throw e;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const addTask = (task: Omit<Task, "id" | "completed">) =>
    mutate(async () => {
      const data = await api<{ task: Task }>("/tasks", {
        method: "POST",
        body: JSON.stringify(task),
      });
      if (alive.current) setTasks((prev) => [...prev, data.task]);
    });
  const editTask = (id: string, changes: Partial<Omit<Task, "id">>) =>
    mutate(async () => {
      const data = await api<{ task: Task }>(`/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      if (alive.current)
        setTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
    });
  const toggleTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    return editTask(id, { completed: !task?.completed });
  };
  const deleteTask = (id: string) =>
    mutate(async () => {
      await api(`/tasks/${id}`, { method: "DELETE" });
      if (alive.current) setTasks((prev) => prev.filter((t) => t.id !== id));
    });
  const importTasks = (items: Task[]) =>
    mutate(async () => {
      for (let i = 0; i < items.length; i += 100)
        await api("/tasks/import", {
          method: "POST",
          body: JSON.stringify({ tasks: items.slice(i, i + 100) }),
        });
      const data = await api<{ tasks: Task[] }>("/tasks");
      if (alive.current) setTasks(data.tasks);
    });
  return {
    tasks,
    loading,
    error,
    busy,
    refresh,
    addTask,
    editTask,
    toggleTask,
    deleteTask,
    importTasks,
  };
}
