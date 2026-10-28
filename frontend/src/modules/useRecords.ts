import { useCallback, useEffect, useRef, useState } from "react";
import { api, messageOf } from "../lib/api";
export function useRecords<T extends { id: string }>(resource: string) {
  const [items, setItems] = useState<T[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const alive = useRef(true),
    lock = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const refresh = useCallback(
    async (signal?: AbortSignal, quiet = false) => {
      if (lock.current) return;
      const turn = ++generation.current;
      if (!quiet) setLoading(true);
      setError("");
      try {
        const data = await api<{ items: T[] }>(resource, { signal });
        if (alive.current && !signal?.aborted && generation.current === turn)
          setItems(data.items);
      } catch (e) {
        if (alive.current && !signal?.aborted && generation.current === turn)
          setError(messageOf(e));
      } finally {
        if (alive.current && !signal?.aborted) setLoading(false);
      }
    },
    [resource],
  );
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer =
      resource === "/habits"
        ? window.setInterval(() => void refresh(undefined, true), 60000)
        : undefined;
    return () => {
      alive.current = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [resource, refresh]);
  async function change(
    path: string,
    method: string,
    body?: unknown,
    removeId?: string,
  ) {
    if (lock.current) throw new Error("Please wait for the current change.");
    lock.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api<{ item: T } | undefined>(resource + path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (alive.current) {
        if (removeId) setItems((prev) => prev.filter((v) => v.id !== removeId));
        else if (data)
          setItems((prev) =>
            prev.some((v) => v.id === data.item.id)
              ? prev.map((v) => (v.id === data.item.id ? data.item : v))
              : [data.item, ...prev],
          );
        setNotice(removeId ? "Deleted." : "Saved.");
      }
    } catch (e) {
      if (alive.current) setError(messageOf(e));
      throw e;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return {
    items,
    loading,
    busy,
    error,
    notice,
    refresh,
    save: (body: unknown, id?: string) =>
      change(id ? "/" + id : "", id ? "PATCH" : "POST", body),
    remove: (id: string) => change("/" + id, "DELETE", undefined, id),
    action: (path: string, method: string, body?: unknown) =>
      change(path, method, body),
  };
}
export type RecordStore<T extends { id: string }> = ReturnType<
  typeof useRecords<T>
>;
