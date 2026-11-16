import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';
import { MutationActor, recordMutation } from '../../platform/public';
import { CatalogManagementService } from './catalog-management.service';
import { ProductImageInputDto } from '../infrastructure/dto/product-image.dto';
import { MediaObjectsService } from '../../media/application/media-objects.service';

@Injectable()
export class ProductMediaService {
  constructor(private readonly db: DatabaseService, private readonly catalog: CatalogManagementService, private readonly objects: MediaObjectsService) {}
  async put(productId: string, dto: ProductImageInputDto, actor: MutationActor) {
    // Validate permission before doing disk work; recheck in the transaction that publishes.
    await this.db.withTransaction((client) => this.catalog.productAccess(client, productId, actor));
    const key = await this.objects.save(dto.content);
    let previous: string | undefined;
    try {
      await this.db.withTransaction(async (client) => {
        await this.catalog.productAccess(client, productId, actor);
        previous = (await client.query('SELECT object_key FROM catalog.product_images WHERE product_id=$1 AND position=$2', [productId,dto.position])).rows[0]?.object_key;
        await client.query(`INSERT INTO catalog.product_images(product_id,object_key,alt_text,position) VALUES($1,$2,$3,$4)
          ON CONFLICT(product_id,position) DO UPDATE SET object_key=excluded.object_key,alt_text=excluded.alt_text`, [productId,key,dto.altText.trim(),dto.position]);
        await recordMutation(client, actor, 'product', productId, 'product.image_published', { position: dto.position });
      });
    } catch (error) { await this.objects.discardUnreferenced(key); throw error; }
    await this.objects.discardUnreferenced(previous);
    return this.catalog.detail(productId,actor);
  }
  async remove(productId: string, imageId: string, actor: MutationActor) {
    const key = await this.db.withTransaction(async (client) => {
      await this.catalog.productAccess(client,productId,actor);
      const result = await client.query('DELETE FROM catalog.product_images WHERE id=$1 AND product_id=$2 RETURNING object_key', [imageId,productId]);
      if (!result.rowCount) throw new NotFoundException('Imagen no encontrada');
      await recordMutation(client,actor,'product',productId,'product.image_removed');
      return result.rows[0].object_key as string;
    });
    await this.objects.discardUnreferenced(key);
  }
  async read(key: string, productId?: string, actor?: MutationActor) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/.test(key)) throw new NotFoundException();
    const exists = productId && actor ? await this.db.withTransaction(async (client) => {
      await this.catalog.productAccess(client,productId,actor,false);
      return client.query('SELECT 1 FROM catalog.product_images WHERE object_key=$1 AND product_id=$2',[key,productId]);
    }) : await this.db.query(`SELECT 1 FROM catalog.product_images i JOIN catalog.products p ON p.id=i.product_id
      JOIN merchant.stores s ON s.id=p.store_id JOIN geography.coverage_zones z ON z.id=s.zone_id
      WHERE i.object_key=$1 AND p.is_active AND s.status='active' AND z.is_active
      AND EXISTS(SELECT 1 FROM catalog.skus sku WHERE sku.product_id=p.id AND sku.is_active)`, [key]);
    if (!exists.rowCount) throw new NotFoundException('Imagen no disponible');
    return this.objects.read(key);
  }
}
