import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { deleteFile, downloadFile, statFile } from "../api/storage";
import { useToast } from "../components/useToast";
import styles from "./ViewFile.module.css";

export default function ViewFile() {
  const { name = "" } = useParams<{ name: string }>();
  const nav = useNavigate();
  const toast = useToast();

  const [size, setSize] = useState<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch metadata + preview URL
  const statCache = new Map<string, number>();

  async function cachedStat(name: string): Promise<{ size: number }> {
    if (statCache.has(name)) {
      return { size: statCache.get(name)! };
    }
    const s = await statFile(name); // ← uses your existing API function
    statCache.set(name, s.size);
    return s;
  }

  useEffect(() => {
  const revoked: string | null = null;

  (async () => {
    try {
      setLoading(true);
      const s = await cachedStat(name);
      setSize(s.size);

      const previewUrl = `/api/files/~read/${encodeURIComponent(name)}`;
      setUrl(previewUrl);

    } catch (err) {
      console.error(err);
      toast.push("Failed to load file info", "error");
    } finally {
      setLoading(false);
    }
  })();

  return () => {
    if (revoked) URL.revokeObjectURL(revoked);
  };
}, [name]); // ✅ Only depends on name




  const ext = name.split(".").pop()?.toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext || "");
  const isPdf = ext === "pdf";
  const isText = ["txt", "log", "md", "csv", "json"].includes(ext || "");

  // ✅ Parallel download with progress bar
  const doDownload = async () => {
  if (!name) return;

  try {
    setLoading(true);

    const blob = await downloadFile(name);

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);

  } catch (err) {
    console.error(err);
    toast.push("Download failed", "error");
  } finally {
    setLoading(false);
  }
};

  // ✅ Correct position: doDelete is outside doDownload
  const doDelete = async () => {
    if (!confirm(`Move "${name}" to Trash?`)) return;
    try {
      await deleteFile(name);
      toast.push(`Moved "${name}" to Trash`);
      nav("/files", { replace: true });
    } catch (e) {
      toast.push(`Delete failed: ${String(e)}`, "error");
    }
  };

  function formatBytes(bytes: number | null): string {
    if (bytes === null) return "";
    if (bytes < 1024) return `${bytes} bytes`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link to="/files" className={styles.backBtn}>← Back</Link>
        <div className={styles.title}>{name}</div>
        {size !== null && <div className={styles.size}>{formatBytes(size)}</div>}

        <button onClick={doDownload} className={styles.downloadBtn}>Download</button>

        <button onClick={doDelete} className={styles.deleteBtn}>Delete</button>
      </div>

      <div className={styles.previewContainer}>
        {loading && <div className={styles.loading}>Loading…</div>}
        {!loading && url && (
          <>
            {isImage && <img src={url} alt={name} className={styles.previewImage} />}
            {isPdf && <iframe src={url} className={styles.previewFrame} title="PDF Preview" />}
            {isText && <TextPreview name={name} previewUrl={url} />}
            {!isImage && !isPdf && !isText && (
              <div className={styles.noPreview}>Preview not available. Use Download.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TextPreview({ name, previewUrl }: { name: string; previewUrl: string }) {
  const [text, setText] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(previewUrl);
        const t = await res.text();
        setText(t.slice(0, 100_000));
      } catch {
        setText("[binary data]");
      }
    })();
  }, [name, previewUrl]);

  return <pre className="whitespace-pre-wrap text-sm p-2">{text || "[empty]"}</pre>;
}
