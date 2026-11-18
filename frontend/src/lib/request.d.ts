export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number);
}
export function requestJson<T>(
  url: string,
  options?: RequestInit,
  settings?: {
    timeoutMs?: number;
    fetcher?: typeof fetch;
    wait?: (ms: number, signal?: AbortSignal | null) => Promise<void>;
  },
): Promise<T>;
