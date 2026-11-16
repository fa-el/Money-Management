import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';

/**
 * Penyimpanan file privat di disk lokal (di luar folder publik). Antarmuka ini sengaja
 * sederhana agar mudah diganti ke object storage privat (S3/GCS/MinIO) di production.
 * File hanya bisa diunduh melalui endpoint API yang memeriksa keanggotaan ruang.
 */
@Injectable()
export class StorageService {
  private readonly root = resolve(process.env.STORAGE_DIR || './storage');

  private pathFor(key: string) {
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root)) throw new Error('Storage key tidak valid');
    return full;
  }

  async save(buffer: Buffer, ext: string): Promise<string> {
    const now = new Date();
    const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${ext}`;
    const full = this.pathFor(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, buffer, { mode: 0o600 });
    return key;
  }

  read(key: string) {
    return readFile(this.pathFor(key));
  }

  stream(key: string) {
    return createReadStream(this.pathFor(key));
  }

  async remove(key: string) {
    await unlink(this.pathFor(key)).catch(() => undefined);
  }
}
