import type { FileItem } from "../types";
import pLimit from "p-limit";

// -----------------------------
// Utility logging
// -----------------------------
function log(msg: string, ...extra: unknown[]) {
  const time = new Date().toISOString().split("T")[1].replace("Z", "");
  console.log(`%c[FRONTEND ${time}]`, "color:#3b82f6;font-weight:600;", msg, ...extra);
}

// -----------------------------
// Constants
// -----------------------------
const CHUNK_SIZE = 256 * 1024; // 256KB
const CONCURRENCY = 4;         // parallel chunk limit

// -----------------------------
// File list / CRUD
// -----------------------------
export async function listFiles(): Promise<FileItem[]> {
  log("→ GET /api/files");
  const r = await fetch("/api/files");
  if (!r.ok) throw new Error("list failed");

  const j = await r.json();
  const files = (j.files as { name?: string; size?: number }[])
    .map((f) => ({
      name: f.name ?? "",
      size: f.size ?? 0,
    }))
    .filter((f: FileItem) => 
      f.name && 
      !f.name.startsWith("store") && 
      !f.name.endsWith(".bin") && 
      !f.name.endsWith(".tmp")  // 👈 exclude temporary NFS files
    );

  log(`✓ Loaded ${files.length} visible files`);
  return files;
}


export async function createFile(name: string): Promise<void> {
  log(`→ POST /api/files/${name}`);
  const r = await fetch(`/api/files/${encodeURIComponent(name)}`, { method: "POST" });
  if (!r.ok) throw new Error("create failed");
  log("✓ Created file:", name);
}

export async function deleteFile(name: string): Promise<void> {
  log(`→ DELETE /api/files/${name}`);
  const r = await fetch(`/api/files/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!r.ok) throw new Error("delete failed");
  log("🗑️  Moved to trash:", name);
}

// -----------------------------
// Trash handling
// -----------------------------
export async function listTrash(): Promise<string[]> {
  log("→ GET /api/files/~trash/list");
  const r = await fetch("/api/files/~trash/list");
  if (!r.ok) throw new Error("list trash failed");
  const j = await r.json();
  log("✓ Trash contains", j.files?.length ?? 0, "items");
  return j.files as string[];
}

export async function restoreFile(name: string): Promise<void> {
  log(`→ POST /api/files/~trash/${name}/restore`);
  const r = await fetch(`/api/files/~trash/${encodeURIComponent(name)}/restore`, { method: "POST" });
  if (!r.ok) throw new Error("restore failed");
  log("♻️  Restored:", name);
}

export async function purgeTrashItem(name: string): Promise<void> {
  log(`→ DELETE /api/files/~trash/${name}`);
  const r = await fetch(`/api/files/~trash/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!r.ok) throw new Error("purge failed");
  log("🧹 Permanently deleted:", name);
}

// -----------------------------
// Stat / basic file info
// -----------------------------
export async function statFile(name: string): Promise<{ size: number; mtime?: number }> {
  log(`→ GET /api/files/${name}/stat`);
  const r = await fetch(`/api/files/${encodeURIComponent(name)}/stat`);
  if (!r.ok) throw new Error("stat failed");
  const j = await r.json() as { size: number; mtime?: number };
  log(`✓ Stat retrieved for ${name}: ${j.size} bytes`);
  return j;
}


// -----------------------------
// Low-level chunk APIs
// -----------------------------
export async function uploadChunk(name: string, offset: number, buf: Uint8Array): Promise<number> {
  const r = await fetch(`/api/files/${encodeURIComponent(name)}`, {
    method: "PATCH",
    headers: { "x-offset": String(offset) },
    body: new Blob([buf.buffer as ArrayBuffer]), // ✅ fixed typing
  });
  if (!r.ok) throw new Error("uploadChunk failed");
  const j = await r.json();
  return j.written as number;
}


export async function readChunk(
  name: string,
  offset: number,
  length: number
): Promise<Uint8Array> {
  const r = await fetch(
    `/api/files/~read/${encodeURIComponent(name)}?offset=${offset}&length=${length}`
  );
  if (!r.ok) throw new Error(`readChunk failed (offset=${offset})`);
  const buf = await r.arrayBuffer();
  return new Uint8Array(buf);
}

// -----------------------------
// High-level helper: upload full file (parallel)
// -----------------------------
export async function uploadFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<void> {
  const name = file.name;
  log(`🚀 Uploading ${name} (${file.size} bytes)`);

  await createFile(name);
  const buf = new Uint8Array(await file.arrayBuffer());
  const chunks: { offset: number; data: Uint8Array }[] = [];
  for (let offset = 0; offset < buf.length; offset += CHUNK_SIZE) {
    chunks.push({ offset, data: buf.slice(offset, offset + CHUNK_SIZE) });
  }

  const limit = pLimit(CONCURRENCY);
  let uploaded = 0;
  await Promise.all(
    chunks.map((chunk) =>
      limit(async () => {
        const written = await uploadChunk(name, chunk.offset, chunk.data);
        uploaded += written;
        if (onProgress) onProgress(Math.floor((uploaded / buf.length) * 100));
      })
    )
  );

  log(`✅ Upload complete: ${name}`);
}

// -----------------------------
// High-level helper: download full file (parallel)
// -----------------------------
export async function downloadFile(name: string): Promise<Blob> {
  const res = await fetch(`/api/files/~read/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return await res.blob();
}


/**
 * Delete multiple files (move to trash in parallel)
 */
export async function deleteFilesBulk(names: string[]): Promise<void> {
  if (!names.length) return;

  log(`🗑️  Bulk delete ${names.length} files`);
  const results = await Promise.allSettled(
    names.map(async (n) => {
      const r = await fetch(`/api/files/${encodeURIComponent(n)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`Delete failed for ${n}`);
      return n;
    })
  );

  const failed = results.filter(r => r.status === "rejected");
  if (failed.length) {
    throw new Error(`${failed.length} deletes failed`);
  }

  log(`✅ Bulk delete done (${names.length - failed.length}/${names.length} succeeded)`);
}

/**
 * Parallel download using Range requests
 */
export async function downloadFileParallel(
  name: string,
  size: number,
  onProgress?: (percent: number) => void,
): Promise<Blob> {

  const CHUNK = 256 * 1024;

  interface RangeEntry {
    start: number;
    end: number;
  }

  const ranges: RangeEntry[] = [];
  for (let start = 0; start < size; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, size - 1);
    ranges.push({ start, end });
  }

  const MAX_PARALLEL = 6;
  let completed = 0;

  // ✅ Pre-allocate correct output buffer array
  const buffers: Uint8Array[] = new Array(ranges.length);

  async function downloadRange(index: number, start: number, end: number) {
    const res = await fetch(`/api/files/~read/${encodeURIComponent(name)}`, {
      headers: { Range: `bytes=${start}-${end}` },
    });

    if (!res.ok && res.status !== 206) {
      throw new Error(`Range request failed: ${start}-${end}`);
    }

    const buf = new Uint8Array(await res.arrayBuffer());
    buffers[index] = buf; // ✅ correct global position

    completed++;
    if (onProgress) {
      onProgress((completed / ranges.length) * 100);
    }
  }

  let next = 0;
  async function worker() {
    while (next < ranges.length) {
      const i = next++;
      const { start, end } = ranges[i];
      await downloadRange(i, start, end);
    }
  }

  await Promise.all(Array.from({ length: MAX_PARALLEL }, worker));

  // ✅ Combine as final blob (correct order guaranteed)
  return new Blob(buffers as BlobPart[], { type: "application/octet-stream" });
}
