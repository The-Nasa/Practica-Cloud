import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../platform/database/database.service';
import { assertStoreManager, assertStoreMember } from '../../merchant/public';
import { MutationActor, recordMutation } from '../../platform/public';
import { BrandingKind, StoreBrandingDto } from '../infrastructure/dto/media.dto';
import { MediaObjectsService } from './media-objects.service';

@Injectable()
export class ProfileMediaService {
  constructor(private readonly db: DatabaseService, private readonly objects: MediaObjectsService) {}
  private async user(client: PoolClient, actor: MutationActor) {
    const user = (await client.query(`SELECT avatar_object_key FROM identity.users WHERE id=$1 AND status='active' FOR UPDATE`,[actor.userId])).rows[0];
    if (!user) throw new UnauthorizedException('La cuenta no está activa');
    return user;
  }
  async avatar(actor: MutationActor) {
    const user = (await this.db.query(`SELECT avatar_object_key FROM identity.users WHERE id=$1 AND status='active'`,[actor.userId])).rows[0];
    if (!user) throw new UnauthorizedException();
    return { url: user.avatar_object_key ? `/api/v1/me/avatar/${user.avatar_object_key}` : null };
  }
  async setAvatar(actor: MutationActor, content?: string) {
    await this.db.withTransaction((client) => this.user(client,actor));
    const key = content === undefined ? null : await this.objects.save(content);
    let previous: string | null = null;
    try {
      await this.db.withTransaction(async (client) => {
        previous = (await this.user(client,actor)).avatar_object_key;
        await client.query('UPDATE identity.users SET avatar_object_key=$2,updated_at=now() WHERE id=$1',[actor.userId,key]);
        await recordMutation(client,actor,'user',actor.userId,key ? 'profile.avatar_published' : 'profile.avatar_removed');
      });
    } catch (error) { await this.objects.discardUnreferenced(key); throw error; }
    await this.objects.discardUnreferenced(previous);
    return this.avatar(actor);
  }
  async avatarBytes(actor: MutationActor, key: string) {
    const reference = await this.avatar(actor);
    if (reference.url !== `/api/v1/me/avatar/${key}`) throw new NotFoundException('Imagen no disponible');
    return this.objects.read(key);
  }
  private urls(id: string, row: { logo_object_key: string | null; banner_object_key: string | null }, privateRead: boolean): StoreBrandingDto {
    const prefix = privateRead ? '/api/v1/merchant/stores' : '/api/v1/stores';
    return { logoUrl: row.logo_object_key ? `${prefix}/${id}/branding/logo/${row.logo_object_key}` : null,
      bannerUrl: row.banner_object_key ? `${prefix}/${id}/branding/banner/${row.banner_object_key}` : null };
  }
  private async store(client: PoolClient, id: string, actor: MutationActor, write: boolean) {
    const store = (await client.query(`SELECT status,logo_object_key,banner_object_key FROM merchant.stores WHERE id=$1 ${write ? 'FOR UPDATE' : 'FOR SHARE'}`,[id])).rows[0];
    if (!store) throw new NotFoundException('Comercio no encontrado');
    if (write) {
      await assertStoreManager(client,id,actor.userId);
      if (store.status === 'suspended') throw new ConflictException('La tienda está suspendida');
    } else await assertStoreMember(client,id,actor.userId);
    return store;
  }
  async branding(id: string, actor?: MutationActor): Promise<StoreBrandingDto> {
    if (actor) return this.db.withTransaction(async (client) => this.urls(id,await this.store(client,id,actor,false),true));
    const row = (await this.db.query(`SELECT s.logo_object_key,s.banner_object_key FROM merchant.stores s
      JOIN geography.coverage_zones z ON z.id=s.zone_id WHERE s.id=$1 AND s.status='active' AND z.is_active`,[id])).rows[0];
    if (!row) throw new NotFoundException('Comercio no disponible');
    return this.urls(id,row,false);
  }
  async setBranding(id: string, kind: BrandingKind, actor: MutationActor, content?: string) {
    await this.db.withTransaction((client) => this.store(client,id,actor,true));
    const key = content === undefined ? null : await this.objects.save(content);
    const column = kind === BrandingKind.logo ? 'logo_object_key' : 'banner_object_key';
    let previous: string | null = null;
    try {
      await this.db.withTransaction(async (client) => {
        const store = await this.store(client,id,actor,true); previous = store[column];
        await client.query(`UPDATE merchant.stores SET ${column}=$2,updated_at=now() WHERE id=$1`,[id,key]);
        await recordMutation(client,actor,'store',id,key ? 'merchant.branding_published' : 'merchant.branding_removed',{kind});
      });
    } catch (error) { await this.objects.discardUnreferenced(key); throw error; }
    await this.objects.discardUnreferenced(previous);
    return this.branding(id,actor);
  }
  async brandingBytes(id: string, kind: BrandingKind, key: string, actor?: MutationActor) {
    const refs = await this.branding(id,actor);
    const expected = kind === BrandingKind.logo ? refs.logoUrl : refs.bannerUrl;
    if (!expected || !expected.endsWith(`/${key}`)) throw new NotFoundException('Imagen no disponible');
    return this.objects.read(key);
  }
}
