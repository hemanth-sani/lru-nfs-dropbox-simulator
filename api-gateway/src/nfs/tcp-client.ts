import * as net from 'net';

const SERVER_HOST = '127.0.0.1';
const SERVER_PORT = 9090;

function now() {
  return new Date().toISOString().split('T')[1].replace('Z', '');
}
function logTcp(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log(`%c[TCP ${now()}]`, 'color:#16a34a;font-weight:600;', ...args);
}

// --------------------------------------------------
// connect() — optional trace id
// --------------------------------------------------
export async function connect(traceId?: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    sock.connect(SERVER_PORT, SERVER_HOST, () => {
      logTcp(`🔌 Connected to NFS server at ${SERVER_HOST}:${SERVER_PORT}`);
      if (traceId) {
        sock.write(`TRACE ${traceId}\n`);
      } else {
        // keep your default behavior
        sock.write(`TRACE node:${process.pid}-${Date.now()}\n`);
      }
      resolve(sock);
    });
    sock.once('error', (err) => {
      logTcp('❌ TCP connection error:', err.message);
      reject(err);
    });
  });
}

// --------------------------------------------------
// wire helpers
// --------------------------------------------------
async function sendAll(sock: net.Socket, buf: Buffer) {
  return new Promise<void>((resolve, reject) => {
    sock.write(buf, (err) => (err ? reject(err) : resolve()));
  });
}

async function readLine(sock: net.Socket): Promise<string> {
  let buf = Buffer.alloc(0);
  while (true) {
    const chunk: Buffer = await new Promise((res, rej) => {
      sock.once('data', res);
      sock.once('error', rej);
      sock.once('close', () => rej(new Error('socket closed')));
    });
    buf = Buffer.concat([buf, chunk]);
    const i = buf.indexOf(0x0a); // '\n'
    if (i >= 0) {
      const line = buf.slice(0, i).toString('utf8').replace(/\r$/, '');
      const rest = buf.slice(i + 1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      if (rest.length) (sock as any).unshift?.(rest);
      return line;
    }
  }
}

async function readN(sock: net.Socket, n: number): Promise<Buffer> {
  let out = Buffer.alloc(0);
  while (out.length < n) {
    const chunk: Buffer = await new Promise((res, rej) => {
      sock.once('data', res);
      sock.once('error', rej);
      sock.once('close', () => rej(new Error('socket closed')));
    });
    out = Buffer.concat([out, chunk]);
  }
  if (out.length > n) {
    const rest = out.slice(n);
    out = out.slice(0, n);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    if (rest.length) (sock as any).unshift?.(rest);
  }
  return out;
}

// --------------------------------------------------
// Commands (one socket per call)
// --------------------------------------------------
export async function sendOpen(name: string): Promise<void> {
  const sock = await connect();
  const start = Date.now();
  try {
    logTcp(`📂 OPEN ${name}`);
    await sendAll(sock, Buffer.from(`OPEN ${name}\n`));
    const line = await readLine(sock);
    logTcp(`✅ Response: ${line} (${Date.now() - start} ms)`);
    if (!line.startsWith('OK')) throw new Error(`OPEN failed: ${line}`);
  } finally {
    sock.destroy();
  }
}

export async function sendList(): Promise<string[]> {
  const sock = await connect();
  const start = Date.now();
  try {
    logTcp('📜 LIST');
    await sendAll(sock, Buffer.from('LIST\n'));
    const line = await readLine(sock);
    if (!line.startsWith('OK ')) throw new Error(`LIST failed: ${line}`);
    const len = parseInt(line.slice(3), 10) || 0;
    const payload = len ? await readN(sock, len) : Buffer.alloc(0);
    const files = payload
      .toString('utf8')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    logTcp(`✅ LIST returned ${files.length} files (${Date.now() - start} ms)`);
    return files;
  } finally {
    sock.destroy();
  }
}

export async function sendStat(name: string): Promise<number> {
  const sock = await connect();
  const start = Date.now();
  try {
    logTcp(`📏 STAT ${name}`);
    await sendAll(sock, Buffer.from(`STAT ${name}\n`));
    const line = await readLine(sock);
    if (!line.startsWith('OK ')) throw new Error(`STAT failed: ${line}`);
    const size = parseInt(line.slice(3), 10) || 0;
    logTcp(`✅ STAT size=${size} (${Date.now() - start} ms)`);
    return size;
  } finally {
    sock.destroy();
  }
}

export async function sendReadFull(name: string): Promise<Buffer> {
  const size = await sendStat(name);
  if (size <= 0) return Buffer.alloc(0);

  const sock = await connect();
  const start = Date.now();
  try {
    logTcp(`📖 READ ${name} (size=${size})`);
    await sendAll(sock, Buffer.from(`OPEN ${name}\n`));
    let line = await readLine(sock);
    if (!line.startsWith('OK')) throw new Error(`OPEN failed: ${line}`);

    await sendAll(sock, Buffer.from(`READ 0 ${size}\n`));
    line = await readLine(sock);
    if (!line.startsWith('OK ')) throw new Error(`READ failed: ${line}`);

    const n = parseInt(line.slice(3), 10) || 0;
    const data = n > 0 ? await readN(sock, n) : Buffer.alloc(0);
    logTcp(`✅ READ ${n} bytes (${Date.now() - start} ms)`);
    return data;
  } finally {
    sock.destroy();
  }
}

// IMPORTANT: your server expects TRASH, not DELETE.
export async function sendDelete(name: string): Promise<void> {
  const sock = await connect();
  const start = Date.now();
  try {
    logTcp(`🗑️ TRASH ${name}`);
    await sendAll(sock, Buffer.from(`TRASH ${name}\n`));
    const line = await readLine(sock);
    logTcp(`✅ TRASH response: ${line} (${Date.now() - start} ms)`);
    if (!line.startsWith('OK')) throw new Error(`TRASH failed: ${line}`);
  } finally {
    sock.destroy();
  }
}

export async function sendWrite(
  name: string,
  offset: number,
  data: Buffer,
): Promise<void> {
  const sock = await connect();
  const start = Date.now();
  try {
    logTcp(`✏️ WRITE ${name} (off=${offset}, len=${data.length})`);
    await sendAll(sock, Buffer.from(`OPEN ${name}\n`));
    let line = await readLine(sock);
    if (!line.startsWith('OK'))
      throw new Error(`OPEN before WRITE failed: ${line}`);

    await sendAll(sock, Buffer.from(`WRITE ${offset} ${data.length}\n`));
    if (data.length) await sendAll(sock, data);

    line = await readLine(sock);
    if (!line.startsWith('OK ')) throw new Error(`WRITE failed: ${line}`);
    const ack = parseInt(line.slice(3), 10) || 0;
    logTcp(`✅ WRITE ack ${ack}/${data.length} (${Date.now() - start} ms)`);
  } finally {
    sock.destroy();
  }
}

// ---- Trash helpers (used by /~trash routes) ----
export async function sendTrash(name: string): Promise<void> {
  return sendDelete(name);
}

export async function sendListTrash(): Promise<string[]> {
  const sock = await connect();
  try {
    logTcp('🧾 LISTTRASH');
    await sendAll(sock, Buffer.from('LISTTRASH\n'));
    const line = await readLine(sock);
    if (!line.startsWith('OK ')) throw new Error(`LISTTRASH failed: ${line}`);
    const len = parseInt(line.slice(3), 10) || 0;
    const payload = len ? await readN(sock, len) : Buffer.alloc(0);
    return payload.toString('utf8').trim().split('\n').filter(Boolean);
  } finally {
    sock.destroy();
  }
}

export async function sendRestore(name: string): Promise<void> {
  const sock = await connect();
  try {
    logTcp(`♻ RESTORE ${name}`);
    await sendAll(sock, Buffer.from(`RESTORE ${name}\n`));
    const line = await readLine(sock);
    if (!line.startsWith('OK')) throw new Error(`RESTORE failed: ${line}`);
  } finally {
    sock.destroy();
  }
}

export async function sendPurge(name: string): Promise<void> {
  const sock = await connect();
  try {
    logTcp(`🧹 PURGETRASH ${name}`);
    await sendAll(sock, Buffer.from(`PURGETRASH ${name}\n`));
    const line = await readLine(sock);
    if (!line.startsWith('OK')) throw new Error(`PURGETRASH failed: ${line}`);
  } finally {
    sock.destroy();
  }
}

// --------------------------------------------------
// Optional: session API for streaming reads
// --------------------------------------------------
export class ReadSession {
  private sock!: net.Socket;
  private opened = false;

  async open(name: string) {
    this.sock = await connect();
    await sendAll(this.sock, Buffer.from(`OPEN ${name}\n`));
    const line = await readLine(this.sock);
    if (!line.startsWith('OK')) throw new Error(`OPEN failed: ${line}`);
    this.opened = true;
  }

  async read(off: number, len: number): Promise<Buffer> {
    if (!this.opened) throw new Error('session not opened');
    await sendAll(this.sock, Buffer.from(`READ ${off} ${len}\n`));
    const line = await readLine(this.sock);
    if (!line.startsWith('OK ')) throw new Error(`READ failed: ${line}`);
    const n = parseInt(line.slice(3), 10) || 0;
    return n ? await readN(this.sock, n) : Buffer.alloc(0);
  }

  close() {
    if (this.sock) this.sock.destroy();
    this.opened = false;
  }
}

export async function sendReadRange(
  name: string,
  offset: number,
  length: number,
): Promise<Buffer> {
  const sock = await connect();
  try {
    // OPEN file
    await sendAll(sock, Buffer.from(`OPEN ${name}\n`));
    let line = await readLine(sock);
    if (!line.startsWith('OK')) throw new Error(`OPEN failed: ${line}`);

    // READ offset length
    await sendAll(sock, Buffer.from(`READ ${offset} ${length}\n`));
    line = await readLine(sock);
    if (!line.startsWith('OK ')) throw new Error(`READ failed: ${line}`);

    const n = parseInt(line.slice(3), 10);
    if (n <= 0) return Buffer.alloc(0);

    return await readN(sock, n);
  } finally {
    sock.destroy();
  }
}
// trace: minor tcp client note (2025-09-25 14:37:00)
// trace: minor tcp client note (2025-09-27 20:37:00)
// trace: minor tcp client note (2025-09-29 10:7:00)
// trace: minor tcp client note (2025-09-30 9:51:00)
// trace: minor tcp client note (2025-10-04 15:58:00)
// trace: minor tcp client note (2025-10-15 16:29:00)
// trace: minor tcp client note (2025-10-16 17:13:00)
// trace: minor tcp client note (2025-10-20 12:3:00)
// trace: minor tcp client note (2025-10-27 20:41:00)
// trace: minor tcp client note (2025-11-02 10:11:00)
