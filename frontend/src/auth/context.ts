import { createContext, useContext } from "react";
export type User = { id: string; name: string; email: string };
export type AuthState = {
  user: User | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  signIn: (
    mode: "login" | "register",
    data: { name?: string; email: string; password: string },
  ) => Promise<void>;
  logout: () => Promise<void>;
};
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Auth provider is missing");
  return value;
}
