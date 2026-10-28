import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, messageOf } from "../lib/api";
import { AuthContext, type User } from "./context";
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ user: User }>("/auth/me");
      setUser(data.user);
    } catch (e) {
      setUser(null);
      if (!(e instanceof ApiError && e.status === 401)) setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const clear = () => setUser(null);
    window.addEventListener("prodtrack:unauthorized", clear);
    return () => window.removeEventListener("prodtrack:unauthorized", clear);
  }, [refresh]);
  async function signIn(
    mode: "login" | "register",
    data: { name?: string; email: string; password: string },
  ) {
    const result = await api<{ user: User }>(`/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    setError("");
    setUser(result.user);
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  }
  return (
    <AuthContext.Provider
      value={{ user, loading, error, refresh, signIn, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
