import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';

const openExpression = `(s.accepting_orders AND z.is_active AND EXISTS(SELECT 1 FROM merchant.opening_intervals h
  WHERE h.store_id=s.id AND h.weekday=extract(isodow FROM now() AT TIME ZONE 'America/Lima')
  AND (now() AT TIME ZONE 'America/Lima')::time>=h.opens_at AND (now() AT TIME ZONE 'America/Lima')::time<h.closes_at))`;
const mediaSelection = `CASE WHEN s.logo_object_key IS NOT NULL THEN '/api/v1/stores/' || s.id || '/branding/logo/' || s.logo_object_key END AS "logoUrl",
  CASE WHEN s.banner_object_key IS NOT NULL THEN '/api/v1/stores/' || s.id || '/branding/banner/' || s.banner_object_key END AS "bannerUrl"`;

@Injectable()
export class MerchantService {
  constructor(private readonly db: DatabaseService) {}
  async listStores(categoryCode?: string) {
    return (await this.db.query(`SELECT s.id,s.category_code,s.zone_id,s.name,s.address_text,s.phone,s.description,
      s.preparation_minutes,s.minimum_order_cents,z.base_fee_cents,
      s.logo_object_key,s.banner_object_key,s.status,s.accepting_orders,z.name AS zone_name,
      r.rating_average,COALESCE(r.rating_count,0) AS rating_count,${openExpression} AS "isOpen",${mediaSelection}
      FROM merchant.stores s JOIN geography.coverage_zones z ON z.id=s.zone_id
      LEFT JOIN merchant.ratings r ON r.store_id=s.id WHERE s.status='active' AND z.is_active
      AND ($1::text IS NULL OR s.category_code=$1) ORDER BY s.name,s.id`, [categoryCode || null])).rows.map(publicNumbers);
  }
  async getStoreById(id: string) {
    const result = await this.db.query(`SELECT s.id,s.category_code,s.zone_id,s.name,s.address_text,s.phone,s.description,
      s.preparation_minutes,s.minimum_order_cents,
      s.logo_object_key,s.banner_object_key,s.status,s.accepting_orders,s.created_at,z.name AS zone_name,z.base_fee_cents,
      r.rating_average,COALESCE(r.rating_count,0) AS rating_count,${openExpression} AS "isOpen",${mediaSelection}
      FROM merchant.stores s JOIN geography.coverage_zones z ON z.id=s.zone_id
      LEFT JOIN merchant.ratings r ON r.store_id=s.id WHERE s.id=$1 AND s.status='active' AND z.is_active`, [id]);
    if (!result.rowCount) throw new NotFoundException('Comercio no encontrado');
    const hours = await this.db.query('SELECT weekday,opens_at,closes_at FROM merchant.opening_intervals WHERE store_id=$1 ORDER BY weekday,opens_at', [id]);
    return { ...publicNumbers(result.rows[0]), openingIntervals: hours.rows };
  }
}

// PostgreSQL numeric averages may arrive as strings. Keep the public JSON contract numeric.
function publicNumbers(row: Record<string, any>) {
  return { ...row, rating_average: row.rating_average == null ? null : Number(row.rating_average),
    rating_count: Number(row.rating_count), minimum_order_cents: Number(row.minimum_order_cents),
    base_fee_cents: Number(row.base_fee_cents) };
}
