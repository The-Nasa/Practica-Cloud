import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../../platform/database/database.service';
import { validatePng } from '../domain/png';

const managedKey = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/;
export const mediaReferences = `SELECT object_key FROM catalog.product_images
  UNION SELECT avatar_object_key FROM identity.users WHERE avatar_object_key IS NOT NULL
  UNION SELECT logo_object_key FROM merchant.stores WHERE logo_object_key IS NOT NULL
  UNION SELECT banner_object_key FROM merchant.stores WHERE banner_object_key IS NOT NULL`;

/** Local object adapter. Callers authorize references before exposing bytes. */
@Injectable()
export class MediaObjectsService {
  private readonly logger = new Logger(MediaObjectsService.name);
  private readonly root = resolve(process.env.MEDIA_ROOT || '.media');
  constructor(private readonly db: DatabaseService) {}
  async save(content: string): Promise<string> {
    const bytes = validatePng(content);
    const key = `${randomUUID()}.png`;
    await mkdir(this.root, { recursive: true });
    const file = await open(join(this.root,key),'wx');
    try { try { await file.writeFile(bytes); } finally { await file.close(); } }
    catch (error) { await unlink(join(this.root,key)).catch(() => {}); throw error; }
    return key;
  }
  async read(key: string): Promise<Buffer> {
    if (!managedKey.test(key)) throw new NotFoundException('Imagen no disponible');
    try { return await readFile(join(this.root,key)); }
    catch { throw new NotFoundException('Imagen no disponible'); }
  }
  async discardUnreferenced(key?: string | null): Promise<void> {
    if (!key || !managedKey.test(key)) return;
    try {
      const referenced = await this.db.query(`SELECT 1 FROM (${mediaReferences}) refs WHERE object_key=$1 LIMIT 1`,[key]);
      if (!referenced.rowCount) await unlink(join(this.root,key)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
    } catch { this.logger.warn('Limpieza de objeto pendiente; ejecutar media:cleanup con escritores detenidos.'); }
  }
}
