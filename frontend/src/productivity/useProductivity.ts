import { useState, useEffect, useCallback, useRef } from "react";
import { api, messageOf } from "../lib/api";
import type { Analytics, FocusSession, Preferences } from "./types";

function createHeartbeatWorker(intervalMs: number, onTick: () => void) {
  if (
    typeof window === "undefined" ||
    typeof Worker === "undefined" ||
    typeof Blob === "undefined"
  ) {
    return null;
  }
  try {
    const workerScript = `
      var timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(function() {
            self.postMessage('tick');
          }, ${intervalMs});
        } else if (e.data === 'stop') {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        }
      };
    `;
    const blob = new Blob([workerScript], { type: "application/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    worker.onmessage = (e) => {
      if (e.data === "tick") onTick();
    };
    worker.postMessage("start");
    return {
      terminate: () => {
        try {
          worker.postMessage("stop");
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
        } catch {
          // ignore cleanup errors
        }
      },
    };
  } catch {
    return null;
  }
}

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
    actionInProgress = useRef(false),
    heartbeatInFlight = useRef(false),
    consecutiveHeartbeatFails = useRef(0),
    sessionRef = useRef<FocusSession | null>(null),
    generation = useRef(0);

  sessionRef.current = session;

  const refresh = useCallback(async () => {
    if (actionInProgress.current) return;
    const turn = ++generation.current;
    try {
      const [active, list, analytics, prefs] = await Promise.all([
        api<{ item: FocusSession | null }>("/focus/active"),
        api<{ items: FocusSession[] }>("/focus"),
        api<Analytics>("/productivity/analytics"),
        api<Preferences>("/productivity/settings"),
      ]);
      if (alive.current && turn === generation.current) {
        setSession(
          active.item
            ? { ...active.item, clientReceivedAt: Date.now() }
            : null,
        );
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
    const onOnline = () => void refresh();
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, revision]);

  const sendHeartbeat = useCallback(async () => {
    const cur = sessionRef.current;
    if (!cur || cur.state !== "running") return;
    if (heartbeatInFlight.current || actionInProgress.current) return;
    heartbeatInFlight.current = true;
    try {
      const result = await api<{ item: FocusSession }>(
        `/focus/${cur.id}/heartbeat`,
        { method: "POST", body: "{}" },
      );
      if (alive.current) {
        consecutiveHeartbeatFails.current = 0;
        setSession({
          ...result.item,
          clientReceivedAt: Date.now(),
        });
        setError((prev) =>
          prev.includes("heartbeat") ||
          prev.includes("Failed to fetch") ||
          prev.includes("NetworkError")
            ? ""
            : prev,
        );
      }
    } catch (e) {
      if (alive.current) {
        consecutiveHeartbeatFails.current++;
        if (consecutiveHeartbeatFails.current >= 3) {
          setError(messageOf(e));
        }
      }
    } finally {
      heartbeatInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (session?.state !== "running") {
      consecutiveHeartbeatFails.current = 0;
      return;
    }

    const worker = createHeartbeatWorker(12000, () => {
      void sendHeartbeat();
    });

    let fallbackTimer: number | null = null;
    if (!worker) {
      fallbackTimer = window.setInterval(() => {
        void sendHeartbeat();
      }, 12000);
    }

    const onWake = () => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      if (worker) {
        worker.terminate();
      }
      if (fallbackTimer !== null) {
        clearInterval(fallbackTimer);
      }
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [session?.id, session?.state, sendHeartbeat]);

  async function change(path: string, body: unknown = {}, method = "POST") {
    if (actionInProgress.current) {
      return;
    }
    actionInProgress.current = true;
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
      if (alive.current && result.item) {
        setSession(
          result.item.active
            ? { ...result.item, clientReceivedAt: Date.now() }
            : null,
        );
      }
    } catch (e) {
      failure = messageOf(e);
    } finally {
      actionInProgress.current = false;
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
