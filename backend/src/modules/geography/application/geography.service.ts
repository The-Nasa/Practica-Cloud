import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../platform/database/database.service';
import { assertAdmin } from '../../../platform/security/admin-access';
import { ListQueryDto, pageOf } from '../../../platform/http/list-query.dto';
import { MutationActor, recordMutation } from '../../platform/public';
import { CreateAddressDto, UpdateAddressDto, CreateZoneDto, UpdateZoneDto } from '../infrastructure/dto/geography.dto';

const zoneSelect = 'id,code,name,description,base_fee_cents AS "baseFeeCents",estimated_minutes AS "estimatedMinutes",is_active AS "isActive"';
const addressSelect = `a.id,a.zone_id AS "zoneId",z.name AS "zoneName",z.is_active AS "zoneActive",a.label,a.recipient_name AS "recipientName",
  a.phone,a.street,a.street_number AS "streetNumber",a.reference,a.is_default AS "isDefault",a.latitude::float8,a.longitude::float8`;

@Injectable()
export class GeographyService {
  constructor(private readonly db: DatabaseService) {}
  async listActiveZones() { return (await this.db.query(`SELECT ${zoneSelect} FROM geography.coverage_zones WHERE is_active ORDER BY name,id`)).rows; }
  async listZones(query: ListQueryDto) {
    const rows = await this.db.query(`SELECT ${zoneSelect} FROM geography.coverage_zones WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT $2`, [query.cursor || null, query.limit + 1]);
    return pageOf(rows.rows, query.limit);
  }
  async saveZone(actor: MutationActor, dto: CreateZoneDto | UpdateZoneDto, id?: string) {
    return this.db.withTransaction(async (client) => {
      await assertAdmin(client, actor.userId);
      let zoneId = id;
      if (!id) {
        const created = await client.query(`INSERT INTO geography.coverage_zones(code,name,description,base_fee_cents,estimated_minutes,is_active)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [(dto as CreateZoneDto).code, dto.name, dto.description || '', dto.baseFeeCents, dto.estimatedMinutes, dto.isActive ?? true]);
        zoneId = created.rows[0].id;
      } else {
        const old = (await client.query('SELECT * FROM geography.coverage_zones WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!old) throw new NotFoundException('Zona no encontrada');
        if (dto.code !== undefined && dto.code !== old.code) throw new BadRequestException('El código de zona no se puede cambiar');
        await client.query(`UPDATE geography.coverage_zones SET name=COALESCE($2,name),description=COALESCE($3,description),
          base_fee_cents=COALESCE($4,base_fee_cents),estimated_minutes=COALESCE($5,estimated_minutes),is_active=COALESCE($6,is_active) WHERE id=$1`,
          [id, dto.name, dto.description, dto.baseFeeCents, dto.estimatedMinutes, dto.isActive]);
        if (dto.isActive === false) await client.query('UPDATE delivery.courier_profiles SET is_online=false WHERE current_zone_id=$1', [id]);
      }
      await recordMutation(client, actor, 'zone', zoneId!, id ? 'geography.zone_updated' : 'geography.zone_created', {
        active: dto.isActive, ...(id ? { reason: (dto as UpdateZoneDto).reason } : {}),
      });
      return (await client.query(`SELECT ${zoneSelect} FROM geography.coverage_zones WHERE id=$1`, [zoneId])).rows[0];
    });
  }
  async getUserAddresses(userId: string) {
    return (await this.db.query(`SELECT ${addressSelect} FROM geography.addresses a JOIN geography.coverage_zones z ON z.id=a.zone_id
      WHERE a.user_id=$1 AND a.archived_at IS NULL ORDER BY a.is_default DESC,a.id`, [userId])).rows;
  }
  async createAddress(actor: MutationActor, dto: CreateAddressDto) {
    return this.db.withTransaction(async (client) => {
      await this.lockOwner(client, actor.userId);
      await this.validateZone(client, dto.zoneId);
      this.validateCoordinates(dto.latitude, dto.longitude);
      const any = await client.query('SELECT id FROM geography.addresses WHERE user_id=$1 AND archived_at IS NULL LIMIT 1', [actor.userId]);
      const isDefault = dto.isDefault === true || !any.rowCount;
      if (isDefault) await this.clearDefault(client, actor.userId);
      const created = await client.query(`INSERT INTO geography.addresses(user_id,zone_id,label,recipient_name,phone,street,street_number,reference,latitude,longitude,is_default)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [actor.userId, dto.zoneId, dto.label, dto.recipientName, dto.phone,
          dto.street, dto.streetNumber, dto.reference || '', dto.latitude ?? null, dto.longitude ?? null, isDefault]);
      const id = created.rows[0].id;
      await recordMutation(client, actor, 'address', id, 'geography.address_created');
      return this.oneAddress(client, actor.userId, id);
    });
  }
  async updateAddress(actor: MutationActor, id: string, dto: UpdateAddressDto) {
    return this.db.withTransaction(async (client) => {
      await this.lockOwner(client, actor.userId);
      const old = (await client.query('SELECT * FROM geography.addresses WHERE id=$1 AND user_id=$2 AND archived_at IS NULL FOR UPDATE', [id, actor.userId])).rows[0];
      if (!old) throw new NotFoundException('Dirección no encontrada');
      if (dto.zoneId && dto.zoneId !== old.zone_id) await this.validateZone(client, dto.zoneId);
      const latitude = dto.latitude === undefined ? old.latitude : dto.latitude;
      const longitude = dto.longitude === undefined ? old.longitude : dto.longitude;
      this.validateCoordinates(latitude, longitude);
      if (dto.isDefault === false && old.is_default) throw new BadRequestException('Seleccione otra dirección como predeterminada antes de desmarcar esta');
      if (dto.isDefault) await this.clearDefault(client, actor.userId);
      await client.query(`UPDATE geography.addresses SET zone_id=COALESCE($3,zone_id),label=COALESCE($4,label),recipient_name=COALESCE($5,recipient_name),
        phone=COALESCE($6,phone),street=COALESCE($7,street),street_number=COALESCE($8,street_number),reference=COALESCE($9,reference),latitude=$10,longitude=$11,
        is_default=COALESCE($12,is_default) WHERE id=$1 AND user_id=$2`, [id, actor.userId, dto.zoneId, dto.label, dto.recipientName, dto.phone,
          dto.street, dto.streetNumber, dto.reference, latitude, longitude, dto.isDefault]);
      await recordMutation(client, actor, 'address', id, 'geography.address_updated');
      return this.oneAddress(client, actor.userId, id);
    });
  }
  async setDefault(actor: MutationActor, id: string) { return this.updateAddress(actor, id, { isDefault: true }); }
  async deleteAddress(actor: MutationActor, id: string) {
    return this.db.withTransaction(async (client) => {
      await this.lockOwner(client, actor.userId);
      const old = (await client.query('UPDATE geography.addresses SET archived_at=now(),is_default=false WHERE id=$1 AND user_id=$2 AND archived_at IS NULL RETURNING id', [id, actor.userId])).rows[0];
      if (!old) throw new NotFoundException('Dirección no encontrada');
      const defaultExists = await client.query('SELECT 1 FROM geography.addresses WHERE user_id=$1 AND archived_at IS NULL AND is_default', [actor.userId]);
      if (!defaultExists.rowCount) await client.query(`UPDATE geography.addresses SET is_default=true WHERE id=(SELECT id FROM geography.addresses
        WHERE user_id=$1 AND archived_at IS NULL ORDER BY id LIMIT 1)`, [actor.userId]);
      await recordMutation(client, actor, 'address', id, 'geography.address_archived');
    });
  }
  private async oneAddress(client: PoolClient, userId: string, id: string) {
    return (await client.query(`SELECT ${addressSelect} FROM geography.addresses a JOIN geography.coverage_zones z ON z.id=a.zone_id
      WHERE a.id=$1 AND a.user_id=$2 AND a.archived_at IS NULL`, [id, userId])).rows[0];
  }
  private async lockOwner(client: PoolClient, id: string) {
    const result = await client.query("SELECT id FROM identity.users WHERE id=$1 AND status='active' FOR UPDATE", [id]);
    if (!result.rowCount) throw new NotFoundException('Cuenta no activa');
  }
  private async clearDefault(client: PoolClient, id: string) { await client.query('UPDATE geography.addresses SET is_default=false WHERE user_id=$1 AND is_default AND archived_at IS NULL', [id]); }
  private async validateZone(client: PoolClient, id: string) {
    if (!(await client.query('SELECT id FROM geography.coverage_zones WHERE id=$1 AND is_active FOR SHARE', [id])).rowCount) throw new BadRequestException('Seleccione una zona activa');
  }
  private validateCoordinates(latitude: unknown, longitude: unknown) {
    if ((latitude == null) !== (longitude == null)) throw new BadRequestException('Latitud y longitud deben informarse juntas');
  }
}
