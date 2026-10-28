import { useState } from "react";
import { FileJson, FileSpreadsheet, Check, AlertCircle } from "lucide-react";
import { messageOf } from "../lib/api";

export function ExportCard() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleDownload(format: "json" | "csv", entity = "all") {
    const key = `${format}-${entity}`;
    setDownloading(key);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/productivity/export?format=${format}&entity=${entity}`,
        {
          credentials: "include",
          headers: {
            "X-ProdTrack-Request": "1",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Export failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition");
      const match = disposition?.match(/filename="([^"]+)"/);
      const filename =
        match?.[1] ||
        (format === "json"
          ? "prodtrack-export.json"
          : `prodtrack-${entity}.csv`);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setNotice(`Downloaded ${filename}`);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="setting-row export-card-row">
      <div className="export-info">
        <strong>Data ownership & export</strong>
        <p>
          Download your personal records anytime. Exports include only your
          authenticated account data and exclude all password hashes and session
          tokens.
        </p>
        {notice && (
          <p className="export-success" role="status">
            <Check size={14} /> {notice}
          </p>
        )}
        {error && (
          <p className="error-banner" role="alert">
            <AlertCircle size={14} /> {error}
          </p>
        )}
        <div className="export-buttons-grid">
          <button
            type="button"
            className="secondary-button export-btn"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload("json")}
          >
            <FileJson size={15} />
            {downloading === "json-all"
              ? "Generating JSON…"
              : "Download Full JSON"}
          </button>
          <button
            type="button"
            className="secondary-button export-btn"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload("csv", "tasks")}
          >
            <FileSpreadsheet size={15} />
            {downloading === "csv-tasks" ? "Exporting…" : "Tasks CSV"}
          </button>
          <button
            type="button"
            className="secondary-button export-btn"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload("csv", "focus")}
          >
            <FileSpreadsheet size={15} />
            {downloading === "csv-focus" ? "Exporting…" : "Focus Sessions CSV"}
          </button>
          <button
            type="button"
            className="secondary-button export-btn"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload("csv", "notes")}
          >
            <FileSpreadsheet size={15} />
            {downloading === "csv-notes" ? "Exporting…" : "Notes CSV"}
          </button>
          <button
            type="button"
            className="secondary-button export-btn"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload("csv", "habits")}
          >
            <FileSpreadsheet size={15} />
            {downloading === "csv-habits" ? "Exporting…" : "Habits CSV"}
          </button>
          <button
            type="button"
            className="secondary-button export-btn"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload("csv", "reviews")}
          >
            <FileSpreadsheet size={15} />
            {downloading === "csv-reviews" ? "Exporting…" : "Daily Reviews CSV"}
          </button>
          <button
            type="button"
            className="secondary-button export-btn"
            disabled={Boolean(downloading)}
            onClick={() => handleDownload("csv", "goals")}
          >
            <FileSpreadsheet size={15} />
            {downloading === "csv-goals" ? "Exporting…" : "Goals CSV"}
          </button>
        </div>
      </div>
    </div>
  );
}
