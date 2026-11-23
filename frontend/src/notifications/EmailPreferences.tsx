import { useCallback, useEffect, useState } from "react";
import { api, messageOf } from "../lib/api";
type Preferences = {
  enabled: boolean;
  reminderTime: string;
  email: string;
  emailVerified: boolean;
  timeZone: string;
  configured: boolean;
};
export function EmailPreferences({ timeZone }: { timeZone?: string }) {
  const [data, setData] = useState<Preferences | null>(null),
    [enabled, setEnabled] = useState(false),
    [time, setTime] = useState("18:00");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [token, setToken] = useState(
    () =>
      new URLSearchParams(window.location.hash.slice(1)).get("verify") || "",
  );
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const value = await api<Preferences>("/notifications/settings", { signal });
    if (signal?.aborted) return;
    setData(value);
    setEnabled(value.enabled);
    setTime(value.reminderTime);
  }, []);
  useEffect(() => {
    if (new URLSearchParams(window.location.hash.slice(1)).has("verify"))
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    const controller = new AbortController();
    void refresh(controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(messageOf(e));
    });
    return () => controller.abort();
  }, [refresh]);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="focus-settings email-preferences"
      aria-labelledby="email-preferences-title"
    >
      <h3 id="email-preferences-title">Email notifications</h3>
      <p className="muted">
        One friendly reminder when today’s planned tasks are unfinished. Always
        optional; habits are not included.
      </p>
      {error && (
        <p className="error-banner" role="alert">
          {error}{" "}
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => void act(refresh)}
          >
            Retry loading
          </button>
        </p>
      )}
      {notice && (
        <p className="save-notice" role="status">
          {notice}
        </p>
      )}
      {!data && !error && (
        <p role="status">Loading notification preferences…</p>
      )}
      {data && (
        <>
          {!data.configured && (
            <p className="muted">
              Email delivery is not enabled by the workspace operator yet. No
              reminder emails will be sent.
            </p>
          )}
          <div className="setting-row">
            <div>
              <strong>
                {data.emailVerified
                  ? "Email verified"
                  : "Verify your email first"}
              </strong>
              <p>{data.email}</p>
            </div>
            {!data.emailVerified && (
              <button
                className="secondary-button"
                disabled={busy || !data.configured}
                onClick={() =>
                  void act(async () => {
                    const result = await api<{ message: string }>(
                      "/notifications/verification",
                      { method: "POST", body: "{}" },
                    );
                    setNotice(result.message);
                  })
                }
              >
                Send verification email
              </button>
            )}
          </div>
          {token && (
            <div className="email-confirm">
              <p>
                Confirm ownership of this email address. Sign in to the account
                that requested this link.
              </p>
              <button
                className="primary-button"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const result = await api<{ message: string }>(
                      "/notifications/verify",
                      { method: "POST", body: JSON.stringify({ token }) },
                    );
                    setToken("");
                    await refresh();
                    setNotice(result.message);
                  })
                }
              >
                Confirm email ownership
              </button>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const value = await api<Preferences>(
                  "/notifications/settings",
                  {
                    method: "PUT",
                    body: JSON.stringify({ enabled, reminderTime: time }),
                  },
                );
                setData(value);
                setEnabled(value.enabled);
                setNotice("Email notification preferences saved.");
              });
            }}
          >
            <label className="email-toggle">
              <input
                type="checkbox"
                checked={enabled}
                disabled={
                  busy ||
                  (!enabled && (!data.emailVerified || !data.configured))
                }
                onChange={(e) => setEnabled(e.target.checked)}
              />{" "}
              Enable daily email reminders
            </label>
            <div className="focus-links">
              <label>
                Daily reminder time
                <input
                  type="time"
                  required
                  value={time}
                  disabled={busy}
                  onChange={(e) => setTime(e.target.value)}
                />
              </label>
              <p className="muted">
                Timezone: {timeZone ?? data.timeZone}. Change your saved
                timezone in Focus & analytics preferences above.
              </p>
            </div>
            <p className="muted">
              We check about every five minutes after your chosen time. Only
              unfinished tasks planned for today and active recurring
              occurrences are included. Tasks without a planned date use their
              deadline. No email is sent for an empty checklist.
            </p>
            <button className="primary-button" disabled={busy}>
              Save email preferences
            </button>
          </form>
          {data.enabled && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const value = await api<Preferences>(
                    "/notifications/settings",
                    { method: "PUT", body: JSON.stringify({ enabled: false }) },
                  );
                  setData(value);
                  setEnabled(false);
                  setNotice("Daily email reminders are off.");
                })
              }
            >
              Unsubscribe from reminders
            </button>
          )}
        </>
      )}
    </section>
  );
}
