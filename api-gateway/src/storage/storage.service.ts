// src/storage/storage.service.ts
import { Injectable } from '@nestjs/common';
import {
  sendList,
  sendOpen,
  sendStat,
  sendReadFull,
  sendWrite,
  sendDelete,
} from '../nfs/tcp-client';

@Injectable()
export class StorageService {
  async listFiles(): Promise<string[]> {
    return sendList();
  }

  async createIfMissing(name: string): Promise<void> {
    // OPEN creates file if missing on the server
    await sendOpen(name);
  }

  async getStat(name: string): Promise<{ name: string; size: number }> {
    const size = await sendStat(name);
    return { name, size };
  }

  async download(name: string): Promise<Buffer> {
    return sendReadFull(name);
  }

  async uploadFull(name: string, buf: Buffer): Promise<void> {
    await sendWrite(name, 0, buf);
  }

  async deleteFile(name: string): Promise<void> {
    await sendDelete(name);
  }

  async patchAtOffset(
    name: string,
    offset: number,
    buf: Buffer,
  ): Promise<void> {
    await sendWrite(name, offset, buf);
  }
}
