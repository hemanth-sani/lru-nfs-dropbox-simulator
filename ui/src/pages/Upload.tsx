import { useState } from "react";
import styles from "./Upload.module.css";
import { uploadFile } from "../api/storage";
import { useToast } from "../components/useToast";
import { useNavigate } from "react-router-dom";

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const toast = useToast();
  const nav = useNavigate();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    setFile(f);
    setName(f.name);
  }

  async function submit() {
    if (!file) {
      toast.push("Choose a file first", "error");
      return;
    }

    try {
      setBusy(true);
      setProgress(0);
      await uploadFile(file, (pct) => setProgress(pct)); // ✅ new helper
      toast.push(`Uploaded ${file.name}`);
      nav("/files", { replace: true });
    } catch (e) {
      toast.push(`Upload failed: ${String(e)}`, "error");
    } finally {
      setBusy(false);
      setFile(null);
      setProgress(0);
    }
  }

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Upload</h1>

      <label className={styles.drop}>
        <div className={styles.dropIcon}>📤</div>
        <div className={styles.dropLead}>Drag & drop files here</div>
        <div className={styles.dropSub}>or click to browse</div>
        <input type="file" className={styles.hiddenFile} disabled={busy} onChange={onPick} />
      </label>

      <div className={styles.row}>
        <input
          className={styles.nameInput}
          disabled={busy}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className={`${styles.btn} ${busy || !file ? styles.btnDisabled : ""}`}
          onClick={submit}
          disabled={busy || !file}
        >
          Upload
        </button>
      </div>

      {busy && (
        <div className={styles.progressWrap}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <div className={styles.progressText}>{progress}%</div>
        </div>
      )}
    </div>
  );
}
{/* upload flow hint 2025-09-24 16:0:00 */}
{/* upload flow hint 2025-10-07 18:29:00 */}
{/* upload flow hint 2025-10-09 20:15:00 */}
{/* upload flow hint 2025-10-11 18:11:00 */}
{/* upload flow hint 2025-10-17 13:14:00 */}
{/* upload flow hint 2025-10-17 10:29:00 */}
{/* upload flow hint 2025-10-26 16:8:00 */}
{/* upload flow hint 2025-11-02 11:47:00 */}
{/* upload flow hint 2025-11-03 14:47:00 */}
{/* upload flow hint 2025-11-04 11:32:00 */}
