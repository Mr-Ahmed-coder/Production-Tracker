import { useState, useEffect, useCallback, useRef } from "react";
import { api, messageOf } from "../lib/api";
import type { Analytics, FocusSession, Preferences } from "./types";
export function useProductivity(revision: string) {
  const [session, setSession] = useState<FocusSession | null>(null),
    [history, setHistory] = useState<FocusSession[]>([]),
    [data, setData] = useState<Analytics | null>(null),
    [settings, setSettings] = useState<Preferences | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const alive = useRef(true),
    lock = useRef(false),
    generation = useRef(0);
  const refresh = useCallback(async () => {
    if (lock.current) return;
    const turn = ++generation.current;
    try {
      const [active, list, analytics, prefs] = await Promise.all([
        api<{ item: FocusSession | null }>("/focus/active"),
        api<{ items: FocusSession[] }>("/focus"),
        api<Analytics>("/productivity/analytics"),
        api<Preferences>("/productivity/settings"),
      ]);
      if (alive.current && turn === generation.current) {
        setSession(active.item);
        setHistory(list.items);
        setData(analytics);
        setSettings(prefs);
        setError("");
      }
    } catch (e) {
      if (alive.current && turn === generation.current) setError(messageOf(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, revision]);
  useEffect(() => {
    if (session?.state !== "running") return;
    const timer = window.setInterval(async () => {
      if (lock.current) return;
      lock.current = true;
      generation.current++;
      try {
        const result = await api<{ item: FocusSession }>(
          `/focus/${session.id}/heartbeat`,
          { method: "POST", body: "{}" },
        );
        if (alive.current) {
          setSession(result.item);
          setError("");
        }
      } catch (e) {
        if (alive.current) setError(messageOf(e));
      } finally {
        lock.current = false;
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [session?.id, session?.state]);
  async function change(path: string, body: unknown = {}, method = "POST") {
    if (lock.current) {
      setError("A sync is in progress. Please try again in a moment.");
      return;
    }
    lock.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    setNotice("");
    let failure = "";
    try {
      const result = await api<{ item?: FocusSession }>(path, {
        method,
        body: JSON.stringify(body),
      });
      if (alive.current) setNotice("Saved.");
      if (alive.current && result.item)
        setSession(result.item.active ? result.item : null);
    } catch (e) {
      failure = messageOf(e);
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        await refresh();
        if (alive.current && failure) setError(failure);
      }
    }
  }
  return {
    session,
    history,
    data,
    settings,
    error,
    notice,
    loading,
    busy,
    refresh,
    change,
  };
}
export type ProductivityStore = ReturnType<typeof useProductivity>;
