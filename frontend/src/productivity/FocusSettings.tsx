import { useState, useEffect } from "react";
import type { ProductivityStore } from "./useProductivity";
export function FocusSettings({ store }: { store: ProductivityStore }) {
  const [zone, setZone] = useState("Africa/Kampala"),
    [target, setTarget] = useState("180");
  const savedZone = store.settings?.timeZone,
    savedTarget = store.settings?.dailyTargetMinutes;
  useEffect(() => {
    if (savedZone && savedTarget) {
      setZone(savedZone);
      setTarget(String(savedTarget));
    }
  }, [savedZone, savedTarget]);
  return (
    <form
      className="focus-settings"
      onSubmit={(e) => {
        e.preventDefault();
        void store.change(
          "/productivity/settings",
          { timeZone: zone, dailyTargetMinutes: Number(target) },
          "PUT",
        );
      }}
    >
      <h3>Focus & analytics preferences</h3>
      <div className="focus-links">
        <label>
          Daily focus target (minutes)
          <input
            type="number"
            required
            min="1"
            max="1440"
            step="1"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <label>
          Analytics timezone
          <input
            required
            maxLength={100}
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="Africa/Kampala"
          />
        </label>
      </div>
      <p className="muted">
        Use an IANA timezone, such as Africa/Kampala or America/New_York.
        Changing it regroups timestamp-based history; habit schedules keep their
        own timezone. Your current target applies to all chart dates.
      </p>
      <button className="primary-button" disabled={store.busy || store.loading}>
        Save preferences
      </button>
    </form>
  );
}
