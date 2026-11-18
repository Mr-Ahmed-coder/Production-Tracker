import { requestJson, ApiError } from "./request.js";
export { ApiError } from "./request.js";
const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  try {
    return await requestJson<T>(`${base}/api${path}`, options);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      !["/auth/login", "/auth/register"].includes(path)
    )
      window.dispatchEvent(new Event("prodtrack:unauthorized"));
    throw error;
  }
}
export const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
