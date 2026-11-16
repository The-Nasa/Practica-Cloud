import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../../platform/database/database.service';
import { assertStoreAccess } from '../../merchant/public';
import { MutationActor, recordMutation } from '../../platform/public';
import { adjustStock, initializeStock } from '../../inventory/public';
import { CatalogQueryDto, CreateSkuDto, PublishProductDto, StockAdjustmentDto, UpdateProductDto, UpdateSkuDto } from '../infrastructure/dto/catalog-management.dto';

// One aggregate per product; prices and availability always belong to individual SKUs.
const selection = `p.id,p.store_id AS "storeId",st.name AS "storeName",p.category_id AS "categoryId",
  p.name,p.description,p.brand,p.is_active AS "isActive",p.position,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'skuCode',s.sku_code,'variantName',s.variant_name,
    'priceCents',s.price_cents,'barcode',s.barcode,'isActive',s.is_active,'availableStock',COALESCE(a.available,0)) ORDER BY s.id)
    FROM catalog.skus s LEFT JOIN inventory.availability a ON a.sku_id=s.id
    WHERE s.product_id=p.id AND ($1 OR s.is_active)), '[]') AS skus,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'url',CASE WHEN i.object_key LIKE 'http://%' OR i.object_key LIKE 'https://%' THEN i.object_key WHEN $1 THEN '/api/v1/merchant/products/' || p.id || '/media/' || i.object_key ELSE '/api/v1/media/' || i.object_key END,
    'altText',i.alt_text,'position',i.position) ORDER BY i.position,i.id)
    FROM catalog.product_images i WHERE i.product_id=p.id),'[]') AS images`;
const from = ` FROM catalog.products p JOIN merchant.stores st ON st.id=p.store_id
  JOIN geography.coverage_zones z ON z.id=st.zone_id `;
const visible = `p.is_active AND st.status='active' AND z.is_active AND EXISTS(SELECT 1 FROM catalog.skus s WHERE s.product_id=p.id AND s.is_active)`;

@Injectable()
export class CatalogManagementService {
  constructor(private readonly db: DatabaseService) {}
  async categories() { return (await this.db.query('SELECT id,code,name FROM catalog.categories ORDER BY name,id')).rows; }
  async list(query: CatalogQueryDto, privateStore?: string, actor?: MutationActor) {
    if (query.minPriceCents !== undefined && query.maxPriceCents !== undefined && query.minPriceCents > query.maxPriceCents)
      throw new BadRequestException('El precio mínimo supera el máximo');
    return this.db.withTransaction(async (client) => {
      if (privateStore && actor) await this.storeAccess(client, privateStore, actor, false);
      const limit = query.limit || 24;
      const rows = (await client.query(`SELECT ${selection}${from} WHERE ($1 OR (${visible}))
        AND ($2::uuid IS NULL OR p.store_id=$2) AND ($3::uuid IS NULL OR p.category_id=$3)
        AND ($4::uuid IS NULL OR st.zone_id=$4) AND ($5::text IS NULL OR p.name ILIKE $5 OR p.description ILIKE $5 OR p.brand ILIKE $5)
        AND ($6::uuid IS NULL OR (p.position,p.id)>((SELECT position FROM catalog.products WHERE id=$6),$6::uuid))
        AND EXISTS(SELECT 1 FROM catalog.skus fs LEFT JOIN inventory.availability fa ON fa.sku_id=fs.id
          WHERE fs.product_id=p.id AND ($1 OR fs.is_active)
          AND ($7::bigint IS NULL OR fs.price_cents >= $7) AND ($8::bigint IS NULL OR fs.price_cents <= $8)
          AND ($9::text IS NULL OR (COALESCE(fa.available,0)>0)=($9='true')))
        ORDER BY p.position,p.id LIMIT $10`, [!!privateStore, privateStore || query.storeId || null, query.category || null,
        query.zoneId || null, query.q?.trim() ? `%${query.q.trim().replace(/[\\%_]/g, '\\$&')}%` : null,
        query.cursor || null, query.minPriceCents ?? null, query.maxPriceCents ?? null, query.available ?? null, limit + 1])).rows;
      return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
    });
  }
  async detail(id: string, actor?: MutationActor) {
    return this.db.withTransaction(async (client) => {
      if (actor) await this.productAccess(client, id, actor, false);
      const result = await client.query(`SELECT ${selection}${from} WHERE p.id=$2 AND ($1 OR (${visible}))`, [!!actor, id]);
      if (!result.rowCount) throw new NotFoundException('Producto no disponible');
      return result.rows[0];
    });
  }
  async storeAccess(client: PoolClient, storeId: string, actor: MutationActor, write = true) {
    const store = await client.query('SELECT id FROM merchant.stores WHERE id=$1 FOR SHARE', [storeId]);
    if (!store.rowCount) throw new NotFoundException('Comercio no encontrado');
    await assertStoreAccess(client, storeId, actor.userId, write ? ['owner','manager'] : ['owner','manager','operator']);
  }
  async productAccess(client: PoolClient, id: string, actor: MutationActor, write = true) {
    const row = (await client.query('SELECT store_id FROM catalog.products WHERE id=$1', [id])).rows[0];
    if (!row) throw new NotFoundException('Producto no encontrado');
    await this.storeAccess(client, row.store_id, actor, write);
    // Serialize aggregate edits (variants, media ordering, product metadata).
    await client.query(`SELECT id FROM catalog.products WHERE id=$1 ${write ? 'FOR UPDATE' : 'FOR SHARE'}`, [id]);
    return row.store_id as string;
  }
  async create(storeId: string, dto: PublishProductDto, actor: MutationActor) {
    return this.db.withTransaction(async (client) => {
      await this.storeAccess(client, storeId, actor);
      const product = (await client.query(`INSERT INTO catalog.products(store_id,category_id,name,description,brand)
        VALUES($1,$2,$3,$4,$5) RETURNING id,name`, [storeId,dto.categoryId,dto.name,dto.description || '',dto.brand || null])).rows[0];
      const sku = await this.insertSku(client, product.id, dto, actor);
      await recordMutation(client, actor, 'product', product.id, 'product.created', { storeId });
      return { productId: product.id, productName: product.name, skuId: sku.id, skuCode: sku.sku_code, priceCents: sku.price_cents, initialStock: dto.initialStock };
    });
  }
  async update(id: string, dto: UpdateProductDto, actor: MutationActor) {
    await this.db.withTransaction(async (client) => {
      await this.productAccess(client, id, actor);
      await client.query(`UPDATE catalog.products SET name=COALESCE($2,name),description=COALESCE($3,description),
        brand=COALESCE($4,brand),category_id=COALESCE($5,category_id),position=COALESCE($6,position),
        is_active=COALESCE($7,is_active),updated_at=now() WHERE id=$1`,
        [id,dto.name,dto.description,dto.brand,dto.categoryId,dto.position,dto.isActive]);
      await recordMutation(client, actor, 'product', id, 'product.updated');
    });
    return this.detail(id, actor);
  }
  async delete(id: string, actor: MutationActor) {
    await this.db.withTransaction(async (client) => {
      await this.productAccess(client, id, actor);
      // Soft-delete: mark product and SKUs as inactive to preserve inventory immutability
      await client.query(`UPDATE catalog.products SET is_active = false, updated_at = now() WHERE id = $1`, [id]);
      await client.query(`UPDATE catalog.skus SET is_active = false WHERE product_id = $1`, [id]);
      await recordMutation(client, actor, 'product', id, 'product.deleted');
    });
  }
  private async insertSku(client: PoolClient, productId: string, dto: CreateSkuDto, actor: MutationActor) {
    const sku = (await client.query(`INSERT INTO catalog.skus(product_id,sku_code,variant_name,price_cents,barcode)
      VALUES($1,$2,$3,$4,$5) RETURNING id,sku_code,price_cents`, [productId,dto.skuCode,dto.variantName,dto.priceCents,dto.barcode || null])).rows[0];
    await initializeStock(client,sku.id,dto.initialStock,dto.lowStockThreshold ?? 5,actor);
    return sku;
  }
  async addSku(id: string, dto: CreateSkuDto, actor: MutationActor) {
    await this.db.withTransaction(async (client) => {
      await this.productAccess(client, id, actor);
      const sku = await this.insertSku(client, id, dto, actor);
      await recordMutation(client, actor, 'sku', sku.id, 'sku.created', { productId: id });
    });
    return this.detail(id, actor);
  }
  private async skuAccess(client: PoolClient, id: string, actor: MutationActor, write = true) {
    const sku = (await client.query('SELECT product_id FROM catalog.skus WHERE id=$1', [id])).rows[0];
    if (!sku) throw new NotFoundException('SKU no encontrado');
    await this.productAccess(client, sku.product_id, actor, write);
    return sku.product_id as string;
  }
  async updateSku(id: string, dto: UpdateSkuDto, actor: MutationActor) {
    const productId = await this.db.withTransaction(async (client) => {
      const productId = await this.skuAccess(client, id, actor);
      await client.query(`UPDATE catalog.skus SET sku_code=COALESCE($2,sku_code),variant_name=COALESCE($3,variant_name),
        price_cents=COALESCE($4,price_cents),barcode=CASE WHEN $5::text IS NULL THEN barcode ELSE NULLIF($5,'') END,
        is_active=COALESCE($6,is_active) WHERE id=$1`, [id,dto.skuCode,dto.variantName,dto.priceCents,dto.barcode,dto.isActive]);
      if (dto.lowStockThreshold !== undefined) await client.query('UPDATE inventory.stock SET low_stock_threshold=$2 WHERE sku_id=$1', [id,dto.lowStockThreshold]);
      await recordMutation(client, actor, 'sku', id, 'sku.updated');
      return productId;
    });
    return this.detail(productId, actor);
  }
  async inventory(storeId: string, actor: MutationActor) {
    return this.db.withTransaction(async (client) => {
      await this.storeAccess(client, storeId, actor, false);
      return (await client.query(`SELECT s.id AS "skuId",p.id AS "productId",p.name AS "productName",s.sku_code AS "skuCode",
        s.variant_name AS "variantName",a.on_hand AS "onHand",a.reserved,a.available,t.low_stock_threshold AS "lowStockThreshold",
        a.available<=t.low_stock_threshold AS "lowStock" FROM catalog.skus s JOIN catalog.products p ON p.id=s.product_id
        JOIN inventory.stock t ON t.sku_id=s.id JOIN inventory.availability a ON a.sku_id=s.id
        WHERE p.store_id=$1 ORDER BY p.name,p.id,s.id`, [storeId])).rows;
    });
  }
  async adjust(id: string, dto: StockAdjustmentDto, actor: MutationActor) {
    return this.db.withTransaction(async (client) => {
      await this.skuAccess(client, id, actor);
      return adjustStock(client,id,dto.quantity,dto.reason,actor);
    });
  }
  async movements(id: string, query: CatalogQueryDto, actor: MutationActor) {
    return this.db.withTransaction(async (client) => {
      await this.skuAccess(client, id, actor, false);
      return (await client.query(`SELECT id,kind,quantity,on_hand_after AS "onHandAfter",reason,actor_user_id AS "actorUserId",created_at AS "createdAt"
        FROM inventory.movements WHERE sku_id=$1 AND ($2::uuid IS NULL OR (created_at,id)>((SELECT created_at FROM inventory.movements WHERE id=$2),$2::uuid))
        ORDER BY created_at,id LIMIT $3`, [id,query.cursor || null,query.limit || 50])).rows;
    });
  }
}
