import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiCookieAuth, ApiCreatedResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../../../platform/guards/auth.guard';
import { MutationRequest, mutationActor } from '../../../platform/public';
import { CatalogManagementService } from '../../application/catalog-management.service';
import { ProductMediaService } from '../../application/product-media.service';
import { ProductImageInputDto } from '../dto/product-image.dto';
import { CatalogPageDto, CatalogProductDto, CatalogQueryDto, CategoryDto, CreatedProductDto, CreateSkuDto, InventoryItemDto, InventoryMovementDto, PublishProductDto, StockAdjustmentDto, UpdateProductDto, UpdateSkuDto } from '../dto/catalog-management.dto';

@ApiTags('Catálogo e inventario') @Controller('api/v1')
export class CatalogManagementController {
  constructor(private readonly catalog: CatalogManagementService, private readonly media: ProductMediaService) {}
  @Post('merchant/products/:id/images') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiCreatedResponse({ type: CatalogProductDto })
  image(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProductImageInputDto, @Req() req: MutationRequest) { return this.media.put(id,dto,mutationActor(req)); }
  @Delete('merchant/products/:id/images/:imageId') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @HttpCode(204)
  removeImage(@Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string, @Req() req: MutationRequest) { return this.media.remove(id,imageId,mutationActor(req)); }
  @Get('media/:key') @ApiProduces('image/png') @ApiOkResponse({schema:{type:'string',format:'binary'}})
  async imageFile(@Param('key') key: string, @Res() response: Response) {
    const bytes = await this.media.read(key);
    response.set({ 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }).send(bytes);
  }
  @Get('merchant/products/:id/media/:key') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiProduces('image/png') @ApiOkResponse({schema:{type:'string',format:'binary'}})
  async ownImageFile(@Param('id', ParseUUIDPipe) id: string, @Param('key') key: string, @Req() req: MutationRequest, @Res() response: Response) {
    const bytes = await this.media.read(key,id,mutationActor(req));
    response.set({ 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }).send(bytes);
  }
  @Get('catalog/categories') @ApiOkResponse({ type: [CategoryDto] })
  categories() { return this.catalog.categories(); }
  @Get('catalog/search') @ApiOkResponse({ type: CatalogPageDto })
  search(@Query() query: CatalogQueryDto) { return this.catalog.list(query); }
  @Get('stores/:id/products') @ApiOkResponse({ type: CatalogPageDto })
  storeProducts(@Param('id', ParseUUIDPipe) id: string, @Query() query: CatalogQueryDto) { return this.catalog.list({ ...query, storeId: id }); }
  @Get('products/:id') @ApiOkResponse({ type: CatalogProductDto })
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.catalog.detail(id); }
  @Get('merchant/stores/:id/products') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({ type: CatalogPageDto })
  own(@Param('id', ParseUUIDPipe) id: string, @Query() query: CatalogQueryDto, @Req() req: MutationRequest) { return this.catalog.list(query, id, mutationActor(req)); }
  @Get('merchant/products/:id') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({ type: CatalogProductDto })
  ownDetail(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationRequest) { return this.catalog.detail(id, mutationActor(req)); }
  @Post('merchant/stores/:id/products') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiCreatedResponse({ type: CreatedProductDto })
  create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PublishProductDto, @Req() req: MutationRequest) { return this.catalog.create(id, dto, mutationActor(req)); }
  @Patch('merchant/products/:id') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({ type: CatalogProductDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @Req() req: MutationRequest) { return this.catalog.update(id, dto, mutationActor(req)); }
  @Delete('merchant/products/:id') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @HttpCode(204)
  deleteProduct(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationRequest) { return this.catalog.delete(id, mutationActor(req)); }
  @Post('merchant/products/:id/skus') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiCreatedResponse({ type: CatalogProductDto })
  addSku(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateSkuDto, @Req() req: MutationRequest) { return this.catalog.addSku(id, dto, mutationActor(req)); }
  @Patch('merchant/skus/:id') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({ type: CatalogProductDto })
  updateSku(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSkuDto, @Req() req: MutationRequest) { return this.catalog.updateSku(id, dto, mutationActor(req)); }
  @Get('merchant/stores/:id/inventory') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({ type: [InventoryItemDto] })
  inventory(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationRequest) { return this.catalog.inventory(id, mutationActor(req)); }
  @Post('merchant/skus/:id/stock-adjustments') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiCreatedResponse({ type: InventoryMovementDto })
  adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StockAdjustmentDto, @Req() req: MutationRequest) { return this.catalog.adjust(id, dto, mutationActor(req)); }
  @Get('merchant/skus/:id/movements') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({ type: [InventoryMovementDto] })
  movements(@Param('id', ParseUUIDPipe) id: string, @Query() query: CatalogQueryDto, @Req() req: MutationRequest) { return this.catalog.movements(id, query, mutationActor(req)); }
}
