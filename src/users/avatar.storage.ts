import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppException, ErrorCode } from '../common/errors/error-codes';

/** Biggest photo accepted. The app shrinks photos to 512 px first, so real uploads are ~50 KB. */
export const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

/** Folder served at /uploads (see main.ts). */
export const UPLOADS_DIR = join(process.cwd(), 'uploads');
const AVATARS_DIR = join(UPLOADS_DIR, 'avatars');

/** Only URLs this class created; anything else is never touched on disk. */
const OWN_URL = /^\/uploads\/avatars\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/;

/**
 * Saves profile photos on the server's disk.
 * The file type is read from the file's first bytes (not from its name or the
 * Content-Type the phone sends), and the name is random, so an upload can't
 * overwrite another file or be served as anything but an image.
 */
@Injectable()
export class AvatarStorage {
  private readonly logger = new Logger(AvatarStorage.name);

  /** Returns the public path, e.g. "/uploads/avatars/0b6c….jpg". */
  async save(data: Buffer): Promise<string> {
    const ext = AvatarStorage.imageType(data);
    if (!ext) throw new AppException(ErrorCode.AVATAR_INVALID, HttpStatus.BAD_REQUEST, 'Only JPEG, PNG or WebP photos');
    await mkdir(AVATARS_DIR, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(AVATARS_DIR, name), data, { flag: 'wx' });
    return `/uploads/avatars/${name}`;
  }

  /** Deletes a photo saved by [save]. Other URLs are ignored. */
  async remove(url: string | null | undefined) {
    const name = url?.match(OWN_URL)?.[1];
    if (!name) return;
    try {
      await unlink(join(AVATARS_DIR, name));
    } catch (e) {
      this.logger.warn(`Could not delete old avatar ${name}: ${(e as Error).message}`);
    }
  }

  private static imageType(b: Buffer): 'jpg' | 'png' | 'webp' | null {
    if (b.length < 12) return null;
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
    if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    return null;
  }
}