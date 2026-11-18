import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, ApiError, messageOf } from "../lib/api";
import { AuthContext, type User } from "./context";
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const turn = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const data = await api<{ user: User }>("/auth/me", { signal });
      if (!signal?.aborted && turn === generation.current) setUser(data.user);
    } catch (e) {
      if (signal?.aborted || turn !== generation.current) return;
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else setError(messageOf(e));
    } finally {
      if (!signal?.aborted && turn === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const clear = () => {
      generation.current++;
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("prodtrack:unauthorized", clear);
    return () => {
      controller.abort();
      window.removeEventListener("prodtrack:unauthorized", clear);
    };
  }, [refresh]);
  async function signIn(
    mode: "login" | "register",
    data: { name?: string; email: string; password: string },
  ) {
    const result = await api<{ user: User }>(`/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    generation.current++;
    setLoading(false);
    setError("");
    setUser(result.user);
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    generation.current++;
    setUser(null);
    setLoading(false);
  }
  return (
    <AuthContext.Provider
      value={{ user, loading, error, refresh, signIn, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
