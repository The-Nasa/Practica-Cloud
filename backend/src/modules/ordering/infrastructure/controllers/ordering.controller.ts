import { ApiResponse } from '@nestjs/swagger';
import { purchaseResponse, legacyPurchasesResponse, orderCancellationResponse, legacyMerchantOrdersResponse, orderMutationResponse } from '../../../../platform/http/operation-response.schemas';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthenticatedUser } from '../../../../platform/guards/auth.guard';
import { Roles, RolesGuard } from '../../../../platform/guards/roles.guard';
import { OrderingService } from '../../application/ordering.service';
import { CancelOrderDto, CreatePurchaseDto, VersionDto } from '../dto/ordering.dto';
import {mutationActor} from '../../../platform/public';

@ApiTags('Compras y Pedidos')
@Controller('api/v1')
export class OrderingController {
  constructor(private readonly orderingService: OrderingService) {}

  @Post('purchases')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('cookie')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Clave de 1 a 200 caracteres, única por intención de compra' })
  @ApiOperation({ summary: 'Crear compra e iniciar reserva de inventario (Idempotente)' })
  @ApiResponse({ status: 201, schema: purchaseResponse })
  async createPurchase(
    @Req() req: { user: AuthenticatedUser },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePurchaseDto,
  ) {
    return this.orderingService.createPurchase(req.user.id, idempotencyKey, dto,mutationActor(req as any));
  }

  @Get('me/purchases')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('cookie')
  @ApiOperation({ summary: 'Consultar historial de compras del cliente' })
  @ApiResponse({ status: 200, schema: legacyPurchasesResponse })
  async getUserPurchases(@Req() req: { user: AuthenticatedUser }) {
    return this.orderingService.getUserPurchases(req.user.id);
  }

  @Post('orders/:id/cancellations')
  @UseGuards(AuthGuard)
  @ApiCookieAuth('cookie')
  @ApiOperation({ summary: 'Cancelar un pedido antes de su preparación (libera reservas de stock)' })
  @ApiResponse({ status: 201, schema: orderCancellationResponse })
  async cancelOrder(
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderingService.cancelOrder(id, req.user.id, dto,mutationActor(req as any));
  }

  @Get('merchant/stores/:storeId/orders')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('merchant', 'admin')
  @ApiCookieAuth('cookie')
  @ApiOperation({ summary: 'Listar comandas de una tienda (Panel de Comercio)' })
  @ApiResponse({ status: 200, schema: legacyMerchantOrdersResponse })
  async getStoreOrders(@Param('storeId') storeId: string, @Req() req: { user: AuthenticatedUser }) {
    return this.orderingService.getStoreOrders(storeId, req.user.id);
  }

  @Post('merchant/orders/:id/accept')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('merchant', 'admin')
  @ApiCookieAuth('cookie')
  @ApiOperation({ summary: 'Comercio acepta pedido (pending -> confirmed)' })
  @ApiResponse({ status: 201, schema: orderMutationResponse })
  async acceptOrder(
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: VersionDto,
  ) {
    return this.orderingService.updateStatus(id, 'confirmed', req.user.id, 'Comercio aceptó el pedido',dto?.expectedVersion,mutationActor(req as any));
  }

  @Post('merchant/orders/:id/start-preparation')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('merchant', 'admin')
  @ApiCookieAuth('cookie')
  @ApiOperation({ summary: 'Comercio inicia preparación en cocina (confirmed -> preparing)' })
  @ApiResponse({ status: 201, schema: orderMutationResponse })
  async startPreparation(
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: VersionDto,
  ) {
    return this.orderingService.updateStatus(id, 'preparing', req.user.id, 'Comercio inició preparación',dto?.expectedVersion,mutationActor(req as any));
  }

  @Post('merchant/orders/:id/mark-ready')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('merchant', 'admin')
  @ApiCookieAuth('cookie')
  @ApiOperation({ summary: 'Comercio marca pedido listo para recojo (preparing -> ready)' })
  @ApiResponse({ status: 201, schema: orderMutationResponse })
  async markReady(
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: VersionDto,
  ) {
    return this.orderingService.updateStatus(id, 'ready', req.user.id, 'Comercio preparó el pedido; listo para recojo',dto?.expectedVersion,mutationActor(req as any));
  }
}
