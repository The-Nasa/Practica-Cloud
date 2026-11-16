import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min, Max, MaxLength, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class ProductFieldsDto {
  @ApiProperty() @IsUUID() categoryId: string;
  @ApiProperty() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @ApiPropertyOptional() @Transform(trim) @IsString() @MaxLength(4000) @IsOptional() description?: string;
  @ApiPropertyOptional() @Transform(trim) @IsString() @MaxLength(100) @IsOptional() brand?: string;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(1000000) @IsOptional() position?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}
export class UpdateProductDto extends PartialType(ProductFieldsDto) {}
export class CreateSkuDto {
  @ApiProperty() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) skuCode: string;
  @ApiProperty() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) variantName: string;
  @ApiProperty({ description: 'Precio absoluto en céntimos PEN' }) @IsInt() @Min(1) @Max(100000000) priceCents: number;
  @ApiPropertyOptional() @Transform(trim) @IsString() @MaxLength(100) @IsOptional() barcode?: string;
  @ApiProperty() @IsInt() @Min(0) @Max(2147483647) initialStock: number;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(2147483647) @IsOptional() lowStockThreshold?: number;
}
export class UpdateSkuDto {
  @ApiPropertyOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) @IsOptional() skuCode?: string;
  @ApiPropertyOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100) @IsOptional() variantName?: string;
  @ApiPropertyOptional() @IsInt() @Min(1) @Max(100000000) @IsOptional() priceCents?: number;
  @ApiPropertyOptional() @Transform(trim) @IsString() @MaxLength(100) @IsOptional() barcode?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
  @ApiPropertyOptional() @IsInt() @Min(0) @Max(2147483647) @IsOptional() lowStockThreshold?: number;
}
export class PublishProductDto extends CreateSkuDto {
  @ApiProperty() @IsUUID() categoryId: string;
  @ApiProperty() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name: string;
  @ApiPropertyOptional() @Transform(trim) @IsString() @MaxLength(4000) @IsOptional() description?: string;
  @ApiPropertyOptional() @Transform(trim) @IsString() @MaxLength(100) @IsOptional() brand?: string;
}
export class StockAdjustmentDto {
  @ApiProperty({ description: 'Variación física; nunca reemplaza el stock ni las reservas' }) @IsInt() @Min(-2147483647) @Max(2147483647) quantity: number;
  @ApiProperty() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}
export class CatalogQueryDto {
  @ApiPropertyOptional() @IsString() @MaxLength(160) @IsOptional() q?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() category?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() storeId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() zoneId?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000000) @IsOptional() minPriceCents?: number;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000000) @IsOptional() maxPriceCents?: number;
  @ApiPropertyOptional({ enum: ['true','false'] }) @Matches(/^(true|false)$/) @IsOptional() available?: string;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) @IsOptional() limit?: number;
  @ApiPropertyOptional({ description: 'Último UUID; productos ordenados por posición/ID, movimientos por fecha/ID' }) @IsUUID() @IsOptional() cursor?: string;
}
export class CategoryDto {
  @ApiProperty() id: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
}
export class CatalogSkuDto {
  @ApiProperty() id: string;
  @ApiProperty() skuCode: string;
  @ApiProperty() variantName: string;
  @ApiProperty() priceCents: number;
  @ApiProperty({ nullable: true, type: String }) barcode: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() availableStock: number;
}
export class CatalogImageDto {
  @ApiProperty() id: string;
  @ApiProperty() url: string;
  @ApiProperty() altText: string;
  @ApiProperty() position: number;
}
export class CatalogProductDto {
  @ApiProperty() id: string;
  @ApiProperty() storeId: string;
  @ApiProperty() storeName: string;
  @ApiProperty() categoryId: string;
  @ApiProperty() name: string;
  @ApiProperty() description: string;
  @ApiProperty({ nullable: true, type: String }) brand: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty() position: number;
  @ApiProperty({ type: [CatalogSkuDto] }) skus: CatalogSkuDto[];
  @ApiProperty({ type: [CatalogImageDto] }) images: CatalogImageDto[];
}
export class CatalogPageDto {
  @ApiProperty({ type: [CatalogProductDto] }) items: CatalogProductDto[];
  @ApiProperty({ nullable: true, type: String }) nextCursor: string | null;
}
export class CreatedProductDto {
  @ApiProperty() productId: string;
  @ApiProperty() productName: string;
  @ApiProperty() skuId: string;
  @ApiProperty() skuCode: string;
  @ApiProperty() priceCents: number;
  @ApiProperty() initialStock: number;
}
export class InventoryItemDto {
  @ApiProperty() skuId: string;
  @ApiProperty() productId: string;
  @ApiProperty() productName: string;
  @ApiProperty() skuCode: string;
  @ApiProperty() variantName: string;
  @ApiProperty() onHand: number;
  @ApiProperty() reserved: number;
  @ApiProperty() available: number;
  @ApiProperty() lowStockThreshold: number;
  @ApiProperty() lowStock: boolean;
}
export class InventoryMovementDto {
  @ApiProperty() id: string;
  @ApiProperty() kind: string;
  @ApiProperty() quantity: number;
  @ApiProperty() onHandAfter: number;
  @ApiProperty() reason: string;
  @ApiProperty({ nullable: true, type: String }) actorUserId: string | null;
  @ApiProperty() createdAt: string;
}
