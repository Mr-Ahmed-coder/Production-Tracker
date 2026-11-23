import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, messageOf } from "../lib/api";
export function UnsubscribePage() {
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") || "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
  }, []);
  async function unsubscribe() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string }>(
        "/email-actions/unsubscribe",
        { method: "POST", body: JSON.stringify({ token }) },
      );
      setNotice(result.message);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-viewport">
      <div className="auth-device-frame auth-status-frame">
        <section className="auth-status-card">
          <span className="eyebrow">StudyMomentum</span>
          <h1>Email reminders</h1>
          {notice ? (
            <p role="status">{notice}</p>
          ) : (
            <>
              <p className="muted">
                Turn off daily reminder emails. Your tasks and progress will
                stay saved. No sign-in is required.
              </p>
              {error && (
                <p className="error-banner" role="alert">
                  {error}
                </p>
              )}
              {token ? (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => void unsubscribe()}
                >
                  {busy ? "Updating…" : "Unsubscribe from reminders"}
                </button>
              ) : (
                <p className="muted">
                  Open the unsubscribe link in your email or turn reminders off
                  in Settings.
                </p>
              )}
            </>
          )}
          <p>
            <Link to="/settings">Go to Settings</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
