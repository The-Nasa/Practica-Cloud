import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MerchantService } from '../../application/merchant.service';
import { PublicStoreDto, PublicStoreDetailDto } from '../dto/public-store.dto';

@ApiTags('Comercios públicos') @Controller('api/v1')
export class StoresController {
  constructor(private readonly merchantService: MerchantService) {}
  @Get('stores') @ApiOperation({ summary: 'Listar comercios activos' }) @ApiQuery({ name: 'category', required: false })
  @ApiOkResponse({ type: [PublicStoreDto] })
  listStores(@Query('category') category?: string) { return this.merchantService.listStores(category); }
  @Get('stores/:id') @ApiOperation({ summary: 'Detalle público de comercio' })
  @ApiOkResponse({ type: PublicStoreDetailDto })
  getStoreById(@Param('id', ParseUUIDPipe) id: string) { return this.merchantService.getStoreById(id); }
}
