export function emailConfig() {
  const {
    EMAIL_REMINDERS_ENABLED,
    RESEND_API_KEY,
    EMAIL_FROM,
    EMAIL_APP_URL,
    EMAIL_TOKEN_SECRET,
  } = process.env;
  if (
    EMAIL_REMINDERS_ENABLED !== "true" ||
    !RESEND_API_KEY ||
    !EMAIL_FROM ||
    !EMAIL_APP_URL ||
    !EMAIL_TOKEN_SECRET ||
    EMAIL_TOKEN_SECRET.length < 32
  )
    return null;
  try {
    const url = new URL(EMAIL_APP_URL);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
      return null;
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    )
      return null;
    if (
      /[\r\n]/.test(EMAIL_FROM) ||
      !/[^\s<>]+@[^\s<>]+\.[^\s<>]+/.test(EMAIL_FROM)
    )
      return null;
    return {
      apiKey: RESEND_API_KEY,
      from: EMAIL_FROM,
      appUrl: url.origin,
      secret: EMAIL_TOKEN_SECRET,
    };
  } catch {
    return null;
  }
}

export class EmailProviderError extends Error {
  constructor(code, retryable) {
    super("Email provider request failed.");
    this.code = code;
    this.retryable = retryable;
  }
}
// One network attempt only. Durable worker state owns retries and idempotency.
export async function sendEmail(
  payload,
  key,
  { config = emailConfig(), fetcher = fetch } = {},
) {
  if (!config) throw new EmailProviderError("not_configured", false);
  let response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new EmailProviderError("network_or_timeout", true);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new EmailProviderError(
      `http_${response.status}`,
      response.status === 429 ||
        response.status === 408 ||
        response.status === 409 ||
        response.status >= 500,
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new EmailProviderError("invalid_response", true);
  }
  if (typeof data?.id !== "string")
    throw new EmailProviderError("invalid_response", true);
  return data.id;
}
