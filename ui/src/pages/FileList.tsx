import { useEffect, useMemo, useState } from "react";
import styles from "./FileList.module.css";
import { listFiles, deleteFile } from "../api/storage";
import { useToast } from "../components/useToast";
import type { FileItem } from "../types";
import { formatSize } from "../utils/formatSize";


type Item = FileItem;

export default function FileList() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const toast = useToast();

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      setLoading(true);
      const arr = await listFiles();

      // If backend sends objects
      setItems(
        arr
          .filter((f) => !f.name.startsWith(".trash"))
          .map((f) => ({ name: f.name, size: f.size }))
      );

    } catch (e) {
      console.error(e);
      toast.push("Failed to load files", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Move "${name}" to Trash?`)) return;
    try {
      await deleteFile(name); // soft delete: moves to .trash
      setItems(prev => prev.filter(it => it.name !== name)); // instant remove
      toast.push(`Moved "${name}" to Trash`);
    } catch (e) {
      toast.push(`Delete failed: ${String(e)}`, "error");
    }
  }

  // 🔍 Instant client-side search
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items
      .filter(it => !it.name.startsWith('.'))
      .filter(it => it.name.toLowerCase().includes(s));
  }, [q, items]);

  function openItem(name: string) {
    window.location.href = `/view/${encodeURIComponent(name)}`;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Files</h1>
      </div>

      {/* Search bar */}
      <div className={styles.searchWrap} role="search">
        <div className={styles.searchBox}>
          <span className={styles.searchIcon} aria-hidden>🔎</span>
          <input
            className={styles.searchInput}
            placeholder="Search files…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search files"
          />
          {q && (
            <button
              className={styles.clearBtn}
              onClick={() => setQ("")}
              aria-label="Clear search"
              title="Clear"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className={styles.muted}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📁</div>
          <div className={styles.emptyLead}>
            {q ? "No files match your search." : "No files yet."}
          </div>
          <div className={styles.emptySub}>
            {q ? "Try a different keyword." : "Upload your first file from the Upload tab."}
          </div>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((it) => (
            <div key={it.name} className={styles.card} title={it.name}>
              <div className={styles.row1}>
                <div className={styles.icon} aria-hidden>📄</div>
                <div className={styles.name}>{it.name}</div>
              </div>

              <div className={styles.meta}>
                {it.size ? formatSize(it.size) : "—"}
              </div>

              <div className={styles.row2}>
                <button onClick={() => openItem(it.name)} className={styles.openBtn}>
                  Open
                </button>
                <button onClick={() => handleDelete(it.name)} className={styles.deleteBtn}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
{/* minor UI polish note 2025-09-25 11:39:00 */}
{/* minor UI polish note 2025-10-02 10:16:00 */}
{/* minor UI polish note 2025-10-03 9:55:00 */}
{/* minor UI polish note 2025-10-05 11:54:00 */}
{/* minor UI polish note 2025-10-07 15:45:00 */}
{/* minor UI polish note 2025-10-08 20:53:00 */}
{/* minor UI polish note 2025-10-19 14:46:00 */}
{/* minor UI polish note 2025-10-20 12:2:00 */}
{/* minor UI polish note 2025-10-22 11:18:00 */}
{/* minor UI polish note 2025-10-24 16:27:00 */}
{/* minor UI polish note 2025-10-30 15:21:00 */}
{/* minor UI polish note 2025-10-30 18:21:00 */}
{/* minor UI polish note 2025-11-04 10:54:00 */}
