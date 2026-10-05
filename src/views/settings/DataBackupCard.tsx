import React, { useRef, useState } from "react";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import { createBackup, restoreBackup } from "../../lib/backup";
import { Toast } from "../../components/Toast";

export const DataBackupCard: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleExport = () => {
    try {
      const backup = createBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dev-home-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSuccessMessage("Backup exported successfully.");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to export backup.");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!window.confirm("Replace all local Dev Home data with this backup?")) {
        return;
      }
      restoreBackup(parsed);
      window.location.reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to import backup.");
    } finally {
      // Reset the input so the same file can be selected again if needed.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <Card className="mb-3">
        <Card.Body>
          <h6 style={{ marginBottom: 4 }}>Data Backup</h6>
          <p className="text-secondary-custom" style={{ fontSize: "0.75rem", marginBottom: 12 }}>
            Export or import your notes, kanban items, saved and JQL filters, focus state, teams,
            and burn-up history. Tokens are not included.
          </p>
          <div className="d-flex gap-2 mb-2">
            <Button variant="outline-primary" size="sm" onClick={handleExport}>
              Export data
            </Button>
            <Button variant="outline-primary" size="sm" onClick={handleImportClick}>
              Import data
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />
          </div>
          <p className="text-secondary-custom" style={{ fontSize: "0.75rem", margin: 0 }}>
            Your data lives only in this browser. Tokens are not included in exports.
          </p>
          {errorMessage && (
            <Alert
              variant="danger"
              className="py-2 mt-2 mb-0"
              dismissible
              onClose={() => setErrorMessage(null)}
            >
              {errorMessage}
            </Alert>
          )}
        </Card.Body>
      </Card>

      {/* Success toast — fixed at the bottom like SettingsView's */}
      <Toast message={successMessage ?? ""} visible={!!successMessage} />
    </>
  );
};
