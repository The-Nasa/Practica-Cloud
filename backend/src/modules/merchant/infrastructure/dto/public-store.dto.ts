import { ApiProperty } from '@nestjs/swagger';

export class PublicStoreDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() category_code: string;
  @ApiProperty({ format: 'uuid' }) zone_id: string;
  @ApiProperty() zone_name: string;
  @ApiProperty() address_text: string;
  @ApiProperty() phone: string;
  @ApiProperty() description: string;
  @ApiProperty() accepting_orders: boolean;
  @ApiProperty() isOpen: boolean;
  @ApiProperty({ type: String, nullable: true }) logoUrl: string | null;
  @ApiProperty({ type: String, nullable: true }) bannerUrl: string | null;
  @ApiProperty({ type: Number, nullable: true }) rating_average: number | null;
  @ApiProperty() rating_count: number;
  @ApiProperty() preparation_minutes: number;
  @ApiProperty({ description: 'Pedido mínimo del comercio, en céntimos PEN' }) minimum_order_cents: number;
  @ApiProperty({ description: 'Tarifa base de la zona del comercio; el envío final se cotiza según destino' }) base_fee_cents: number;
}

export class PublicOpeningIntervalDto {
  @ApiProperty({ minimum: 1, maximum: 7 }) weekday: number;
  @ApiProperty() opens_at: string;
  @ApiProperty() closes_at: string;
}

export class PublicStoreDetailDto extends PublicStoreDto {
  @ApiProperty({ type: [PublicOpeningIntervalDto] }) openingIntervals: PublicOpeningIntervalDto[];
}
