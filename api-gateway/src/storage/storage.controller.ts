// controller: small cleanup note
// controller: small cleanup note
// controller: small cleanup note
// controller: small cleanup note
// controller: small cleanup note
// controller: small cleanup note
// controller: small cleanup note
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Res,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { lookup as mimeLookup } from 'mime-types';

// ✅ TCP client imports (aligned with your new tcp-client.ts)
import {
  sendWrite,
  sendList,
  sendStat,
  sendDelete,
  sendListTrash,
  sendRestore,
  sendPurge,
  ReadSession,
} from '../nfs/tcp-client.js';

// ✅ Unified logger
function logBackend(tag: string, ...msg: unknown[]) {
  const time = new Date().toISOString().split('T')[1].replace('Z', '');
  const level =
    tag === 'ERROR'
      ? 'color:red'
      : tag === 'WARN'
        ? 'color:orange'
        : 'color:cyan';
  console.log(`%c[BACKEND ${time}] [${tag}]`, level, ...msg);
}

@Controller('api/files')
export class StorageController {
  // -------------------------------------------------------
  //  🗑️ TRASH ROUTES
  // -------------------------------------------------------
  @Get('~trash/list')
  async listTrash(): Promise<{ files: string[] }> {
    try {
      const files = await sendListTrash();
      logBackend('INFO', `📂 listTrash() returned ${files.length} files`);
      return { files };
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      logBackend('ERROR', '❌ listTrash failed', err.message);
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Failed to list trash: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('~trash/:name/restore')
  async restore(@Param('name') name: string) {
    try {
      await sendRestore(name);
      logBackend('INFO', `♻️ restored(${name})`);
      return { ok: true, restored: name };
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      logBackend('ERROR', '❌ restore failed', err.message);
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Failed to restore: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('~trash/:name')
  async purge(@Param('name') name: string) {
    try {
      await sendPurge(name);
      logBackend('INFO', `🧹 purged(${name})`);
      return { ok: true, purged: name };
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      logBackend('ERROR', '❌ purge failed', err.message);
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Failed to purge: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // -------------------------------------------------------
  // 📁 FILE ROUTES
  // -------------------------------------------------------

  @Get()
  async list(): Promise<{ files: { name: string; size: number }[] }> {
    logBackend('INFO', '📄 GET /api/files');
    const start = Date.now();
    try {
      const names = await sendList();

      const statPromises = names.map((name) =>
        Promise.race([
          sendStat(name),
          new Promise<number>((_, rej) =>
            setTimeout(() => rej(new Error('STAT timeout')), 2000),
          ),
        ]).then(
          (size) => ({ name, size }),
          () => ({ name, size: 0 }),
        ),
      );

      const files = await Promise.all(statPromises);

      logBackend(
        'INFO',
        `✅ Returned ${files.length} files (${Date.now() - start} ms)`,
      );
      return { files };
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      logBackend('ERROR', '❌ list() failed', err.message);
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `list failed: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':name/stat')
  async filestat(@Param('name') name: string) {
    const start = Date.now();
    try {
      const size = await sendStat(name);
      logBackend(
        'INFO',
        `📏 stat(${name}) size=${size} (${Date.now() - start} ms)`,
      );
      return { size };
    } catch (err) {
      logBackend('ERROR', `stat failed for ${name}`, err);
      throw new HttpException(
        'Failed to get stat',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ✅ NEW: streaming read (used by viewer / download)
  @Get('~read/:name')
  async streamRead(@Param('name') name: string, @Res() res: Response) {
    try {
      const size = await sendStat(name);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const mimeType = (mimeLookup(name) ||
        'application/octet-stream') as string;

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', String(size));
      res.setHeader('Accept-Ranges', 'bytes');

      const session = new ReadSession();
      await session.open(name);

      const CHUNK = 256 * 1024;
      let off = 0;

      while (off < size) {
        const need = Math.min(CHUNK, size - off);
        const buf = await session.read(off, need);
        if (!buf.length) break;
        res.write(buf);
        off += buf.length;
      }
      session.close();
      res.end();

      logBackend('INFO', `📤 streamed(${name}) ${size} bytes`);
    } catch (err) {
      logBackend('ERROR', 'stream read failed', err);
      throw new HttpException(
        'Failed to stream file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':name')
  async create(@Param('name') name: string) {
    logBackend('INFO', `🆕 create(${name})`);
    try {
      await sendWrite(name, 0, Buffer.alloc(0));
      logBackend('INFO', `✅ created ${name}`);
      return { ok: true };
    } catch (err) {
      logBackend('ERROR', '❌ create failed', name, err);
      throw new HttpException(
        'Failed to create file',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':name')
  async writeChunk(@Param('name') name: string, @Req() req: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const offHdr = req.headers['x-offset'];
    if (offHdr === undefined)
      throw new HttpException(
        'x-offset header required',
        HttpStatus.BAD_REQUEST,
      );

    const offset = Number(offHdr);
    if (!Number.isFinite(offset) || offset < 0)
      throw new HttpException('invalid offset', HttpStatus.BAD_REQUEST);

    const chunks: Buffer[] = [];
    for await (const ch of req) chunks.push(ch as Buffer);
    const buf = Buffer.concat(chunks);

    const start = Date.now();
    logBackend(
      'INFO',
      `✏️ writeChunk(${name}) off=${offset} len=${buf.length}`,
    );

    try {
      await sendWrite(name, offset, buf);
      logBackend('INFO', `✅ NFS write completed (${Date.now() - start} ms)`);
      return { written: buf.length, offset };
    } catch (err) {
      logBackend('ERROR', `❌ write failed`, err);
      throw new HttpException(
        'Failed to write via NFS',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':name')
  async softDelete(@Param('name') name: string) {
    const start = Date.now();
    logBackend('WARN', `🗑️ softDelete(${name})`);
    try {
      await sendDelete(name);
      logBackend(
        'INFO',
        `✅ moved ${name} to trash (${Date.now() - start} ms)`,
      );
      return { ok: true, trashed: name };
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      logBackend('ERROR', `❌ softDelete failed`, err.message);
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        `Failed to move to trash: ${err.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
