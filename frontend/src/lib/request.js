// Shared transport: only GET/HEAD requests are retried. Never log bodies or cookies.
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
const temporary = new Set([408, 502, 503, 504]);
const abortError = () => new DOMException("Request cancelled.", "AbortError");
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const finish = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(abortError());
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
export async function requestJson(url, options = {}, settings = {}) {
  const method = (options.method || "GET").toUpperCase(),
    read = method === "GET" || method === "HEAD";
  const tries = read ? 3 : 1,
    timeoutMs = settings.timeoutMs ?? (read ? 20000 : 30000),
    fetcher = settings.fetcher ?? globalThis.fetch,
    wait = settings.wait ?? pause;
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  headers.set("X-ProdTrack-Request", "1");
  const message = read
    ? "StudyMomentum is taking longer than usual. The server may be waking up. Wait a moment, then try again."
    : "We could not confirm this change. Check your saved records before trying again.";
  for (let attempt = 0; attempt < tries; attempt++) {
    if (options.signal?.aborted) throw abortError();
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    options.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    let retry = false;
    try {
      const response = await fetcher(url, {
        ...options,
        method,
        headers,
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      if (temporary.has(response.status)) {
        // Discard a gateway response before retrying; no private response content is logged.
        await response.body?.cancel();
        if (read && attempt + 1 < tries) retry = true;
        else throw new ApiError(message, response.status);
      } else {
        if (response.status === 204 || method === "HEAD") {
          if (!response.ok)
            throw new ApiError(
              "Request failed. Please try again.",
              response.status,
            );
          return undefined;
        }
        const type = response.headers.get("Content-Type") || "";
        if (!/application\/(?:[a-z0-9.+-]+\+)?json(?:;|$)/i.test(type))
          throw new ApiError(
            "StudyMomentum received an unexpected server response. Reload the page and try again.",
            502,
          );
        let body;
        try {
          body = await response.json();
        } catch (e) {
          if (e instanceof SyntaxError)
            throw new ApiError(
              "StudyMomentum received an incomplete server response. Please try again.",
              502,
            );
          throw e;
        }
        if (!response.ok)
          throw new ApiError(
            typeof body?.error === "string"
              ? body.error.slice(0, 500)
              : "Request failed. Please try again.",
            response.status,
          );
        return body;
      }
    } catch (e) {
      if (options.signal?.aborted) throw abortError();
      if (e instanceof ApiError) throw e;
      if (read && attempt + 1 < tries) retry = true;
      else
        throw new ApiError(
          timedOut
            ? message
            : read
              ? "Cannot reach StudyMomentum. Check your connection and try again."
              : message,
          0,
        );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    }
    if (retry) await wait(1000 * (attempt + 1), options.signal);
  }
  throw new ApiError(message, 0);
}
