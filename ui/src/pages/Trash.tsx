import { useEffect, useState } from "react";
import styles from "./Trash.module.css";
import { listTrash, restoreFile, purgeTrashItem } from "../api/storage";
import { useToast } from "../components/useToast";

export default function Trash() {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      setLoading(true);
      const arr = await listTrash();
      setItems(arr);
    } catch (e) {
      toast.push(`Failed to load trash: ${String(e)}`, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(name: string) {
    try {
      await restoreFile(name);
      toast.push(`Restored "${name}"`);
      await refresh();
    } catch (e) {
      toast.push(`Restore failed: ${String(e)}`, "error");
    }
  }

  async function handlePurge(name: string) {
    if (!confirm(`Permanently delete "${name}"?`)) return;
    try {
      await purgeTrashItem(name);
      toast.push(`Deleted "${name}" permanently`);
      await refresh();
    } catch (e) {
      toast.push(`Delete failed: ${String(e)}`, "error");
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Trash</h1>
      </div>

      {loading ? (
        <div className={styles.muted}>Loading…</div>
      ) : items.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🗑️</div>
          <div className={styles.emptyLead}>Trash is empty</div>
          <div className={styles.emptySub}>Deleted files appear here temporarily.</div>
        </div>
      ) : (
        <div className={styles.grid}>
          {items.map((name) => (
            <div key={name} className={styles.card}>
              <div className={styles.row1}>
                <div className={styles.icon}>📄</div>
                <div className={styles.name}>{name}</div>
              </div>
              <div className={styles.row2}>
                <button onClick={() => handleRestore(name)} className={styles.restoreBtn}>
                  ♻ Restore
                </button>
                <button onClick={() => handlePurge(name)} className={styles.deleteBtn}>
                  🗑 Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
