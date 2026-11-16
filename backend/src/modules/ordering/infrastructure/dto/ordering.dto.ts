import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  Max,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
  Min, MaxLength,
} from 'class-validator';

export class PurchaseItemDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID del SKU a comprar' })
  @IsUUID()
  skuId: string;

  @ApiProperty({ example: 2, description: 'Cantidad deseada' })
  @IsInt()
  @IsPositive({ message: 'La cantidad debe ser mayor a cero' })
  @Max(10000)
  quantity: number;

  @ApiPropertyOptional({ example: 'Sin ají' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}

export class CreatePurchaseDto {
  @ApiPropertyOptional({description:'Total revisado por el cliente; se compara con el cálculo vigente del servidor'})
  @IsOptional() @IsInt() @Min(1) @Max(100000000000000) expectedTotalCents?: number;
  @ApiPropertyOptional({type:Number,nullable:true,description:'Importe previsto en céntimos; omitir/null significa importe exacto calculado por servidor'})
  @IsOptional() @IsInt() @Min(1) @Max(100000000000000) cashTenderCents?: number | null;
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000', description: 'ID de la dirección de entrega del usuario' })
  @IsUUID()
  addressId: string;

  @ApiProperty({ example: 'cash', enum: ['cash'], description: 'Efectivo; digital se habilitará en F6' })
  @IsIn(['cash'])
  paymentMethod: string;

  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'El pedido debe incluir al menos un producto' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
}

export class CancelOrderDto {
  @ApiProperty() @IsInt() @Min(0) expectedVersion: number;
  @ApiProperty({ example: 'Cliente solicitó cambio de planes' })
  @IsString()
  @IsNotEmpty({ message: 'El motivo de cancelación es obligatorio' })
  @Transform(({value})=>typeof value==='string' ? value.trim() : value) @MaxLength(500)
  reason: string;
}

export class VersionDto {
  @ApiProperty() @IsInt() @Min(0) expectedVersion: number;
}
export class DeliverCashDto extends VersionDto {
  @ApiProperty({description:'Efectivo recibido y confirmado por el repartidor, en céntimos'})
  @IsInt() @Min(1) @Max(100000000000000) cashReceivedCents: number;
}
export class AssignCourierDto extends CancelOrderDto {
  @ApiProperty() @IsUUID() courierUserId: string;
}
