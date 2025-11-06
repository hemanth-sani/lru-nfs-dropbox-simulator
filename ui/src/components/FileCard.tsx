import React from "react";
import styles from "./FileCard.module.css";

interface Props {
  name: string;
  onOpen?: () => void;
  onDelete?: () => void;
}

export default function FileCard({ name, onOpen, onDelete }: Props) {
  return (
    <div className={styles.card}>
      <div className={styles.name} title={name}>{name}</div>

      <div className={styles.actions}>
        {onOpen && (
          <button onClick={onOpen} className={styles.restoreBtn}>
            ♻ Restore
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} className={styles.deleteBtn}>
            🗑 Delete
          </button>
        )}
      </div>
    </div>
  );
}
