import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, CheckCircle2 } from "lucide-react";
import { useAuth } from "./context";
import { messageOf } from "../lib/api";
import { AuthIllustration } from "./AuthIllustration";
import { StudyMomentumWordmark } from "../components/BrandLogo";
import App from "../App";

export function AuthGate() {
  const auth = useAuth();
  const location = useLocation();
  const authPage = ["/login", "/register"].includes(location.pathname);

  if (auth.loading) {
    return (
      <main className="auth-viewport">
        <div className="auth-device-frame auth-status-frame">
          <section className="auth-status-card" role="status">
            <div className="auth-status-spinner" aria-hidden="true" />
            <h2>Opening your workspace…</h2>
            <p className="muted">Restoring your session</p>
          </section>
        </div>
      </main>
    );
  }

  if (auth.error) {
    return (
      <main className="auth-viewport">
        <div className="auth-device-frame auth-status-frame">
          <section className="auth-status-card">
            <h2>Let’s reconnect.</h2>
            <p className="error-banner" role="alert">
              {auth.error}
            </p>
            <button
              className="primary-button auth-submit-btn"
              onClick={() => void auth.refresh()}
            >
              Try again
            </button>
          </section>
        </div>
      </main>
    );
  }

  if (!auth.user) {
    if (!authPage) {
      return (
        <Navigate to="/login" replace state={{ from: location.pathname }} />
      );
    }
    return <AuthPage key={location.pathname} />;
  }

  if (authPage) {
    const from = location.state?.from;
    return (
      <Navigate
        to={
          typeof from === "string" &&
          from.startsWith("/") &&
          !from.startsWith("//") &&
          !["/login", "/register"].includes(from)
            ? from
            : "/"
        }
        replace
      />
    );
  }

  return <App key={auth.user.id} />;
}

function AuthPage() {
  const { signIn } = useAuth();
  const location = useLocation();
  const register = location.pathname === "/register";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await signIn(register ? "register" : "login", {
        ...(register ? { name: String(form.get("name")).trim() } : {}),
        email: String(form.get("email")).trim(),
        password: String(form.get("password")),
      });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-viewport">
      <div className="auth-device-frame">
        <div className="auth-split-layout">
          {/* Left Panel: Visual Experience */}
          <section
            className="auth-visual-panel"
            aria-label="Welcome illustration and productivity overview"
          >
            <div className="auth-visual-header">
              <Link className="auth-brand" to="/login" aria-label="StudyMomentum Home">
                <StudyMomentumWordmark size={24} />
              </Link>
              <span className="auth-pill-tag">Mindful Workspace</span>
            </div>

            <div className="auth-visual-graphic">
              <AuthIllustration />
            </div>

            <div className="auth-visual-footer">
              <h2 className="auth-visual-title">Focus Today. Grow Every Day.</h2>
              <p className="auth-visual-desc">
                A personal productivity platform for students, professionals, and lifelong learners.
              </p>
              <div className="auth-visual-pills">
                <span className="auth-pill">
                  <CheckCircle2 size={13} className="pill-icon" aria-hidden="true" /> Server-timed Focus
                </span>
                <span className="auth-pill">
                  <CheckCircle2 size={13} className="pill-icon" aria-hidden="true" /> Habit Streaks
                </span>
                <span className="auth-pill">
                  <CheckCircle2 size={13} className="pill-icon" aria-hidden="true" /> Zero Fluff
                </span>
              </div>
            </div>
          </section>

          {/* Right Panel: Authentication Form */}
          <section className="auth-form-panel">
            <div className="auth-form-card">
              <div className="auth-form-header">
                <div className="auth-mobile-brand">
                  <Link className="auth-brand" to="/login" aria-label="StudyMomentum Home">
                    <StudyMomentumWordmark size={22} />
                  </Link>
                </div>
                <span className="auth-eyebrow">
                  {register ? "GET STARTED" : "WELCOME BACK"}
                </span>
                <h1 className="auth-form-title">
                  {register ? "Create your account" : "Welcome back"}
                </h1>
                <p className="auth-form-subtitle">
                  {register
                    ? "Start your journey toward better focus, habits and goals."
                    : "Continue building a better version of yourself."}
                </p>
              </div>

              <form onSubmit={submit} className="auth-form" noValidate={false}>
                {register && (
                  <div className="auth-field-group">
                    <label htmlFor="auth-name-input" className="auth-label">
                      Your name
                    </label>
                    <div className="auth-input-wrapper">
                      <User size={18} className="auth-input-icon" aria-hidden="true" />
                      <input
                        id="auth-name-input"
                        name="name"
                        type="text"
                        autoComplete="name"
                        required
                        maxLength={60}
                        placeholder="Alex Morgan"
                        className="auth-input"
                      />
                    </div>
                  </div>
                )}

                <div className="auth-field-group">
                  <label htmlFor="auth-email-input" className="auth-label">
                    Email
                  </label>
                  <div className="auth-input-wrapper">
                    <Mail size={18} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="auth-email-input"
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                      maxLength={254}
                      placeholder="alex@example.com"
                      className="auth-input"
                    />
                  </div>
                </div>

                <div className="auth-field-group">
                  <div className="auth-label-row">
                    <label htmlFor="auth-password-input" className="auth-label">
                      Password
                    </label>
                    {register && (
                      <span className="auth-hint">8–128 characters</span>
                    )}
                  </div>
                  <div className="auth-input-wrapper">
                    <Lock size={18} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="auth-password-input"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={register ? "new-password" : "current-password"}
                      required
                      minLength={register ? 8 : undefined}
                      maxLength={128}
                      placeholder={register ? "At least 8 characters" : "Enter your password"}
                      className="auth-input auth-input-password"
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p className="error-banner auth-error-banner" role="alert">
                    {error}
                  </p>
                )}

                <button
                  className="primary-button auth-submit-btn"
                  disabled={busy}
                  type="submit"
                >
                  <span>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}</span>
                  {!busy && <ArrowRight size={17} className="auth-btn-icon" aria-hidden="true" />}
                </button>
              </form>

              <footer className="auth-form-footer">
                <p className="auth-switch-text">
                  {register ? "Already have an account?" : "New to StudyMomentum?"}{" "}
                  <Link
                    to={register ? "/login" : "/register"}
                    state={location.state}
                    className="auth-switch-link"
                  >
                    {register ? "Sign in" : "Create account"}
                  </Link>
                </p>
              </footer>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
