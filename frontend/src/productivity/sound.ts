// Web Audio API synthesized completion chime and desktop notifications.
// Operates entirely offline without external audio files.

export function playChime() {
  if (typeof window === "undefined") return;
  const enabled = localStorage.getItem("prodtrack.focus.sound") !== "false";
  if (!enabled) return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    // Gentle chord: D5 (587.33 Hz) transitioning into A5 (880 Hz)
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.35);

    osc2.start(now + 0.12);
    osc2.stop(now + 0.9);
  } catch {
    // Audio playback prevented by browser autoplay policy before user gesture
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return false;
}

export function showNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  const enabled =
    localStorage.getItem("prodtrack.focus.notifications") !== "false";
  if (!enabled) return;

  if (Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/favicon.ico" });
    } catch {
      // Notification creation failed
    }
  }
}
