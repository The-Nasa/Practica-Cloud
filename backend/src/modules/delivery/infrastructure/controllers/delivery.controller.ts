import { ApiResponse } from '@nestjs/swagger';
import { legacyAvailableOrdersResponse, legacyActiveAssignmentResponse, assignmentResponse, pickupResponse, deliveryResponse, releaseResponse, incidentResponse, availableCouriersResponse } from '../../../../platform/http/operation-response.schemas';
import {
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Query,
  Req,
  UseGuards,
  Body,ParseUUIDPipe,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthenticatedUser } from '../../../../platform/guards/auth.guard';
import { Roles, RolesGuard } from '../../../../platform/guards/roles.guard';
import { DeliveryService } from '../../application/delivery.service';
import {VersionDto,DeliverCashDto,CancelOrderDto,AssignCourierDto} from '../../../ordering/infrastructure/dto/ordering.dto';
import { AssociateCourierDto } from '../dto/courier-profile.dto';
import {MutationRequest,mutationActor} from '../../../platform/public';

@ApiTags('Reparto y Entregas')
@Controller('api/v1/courier')
@UseGuards(AuthGuard, RolesGuard)
@Roles('courier', 'admin')
@ApiCookieAuth('cookie')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('available-orders')
  @ApiOperation({ summary: 'Listar pedidos listos para recojo en espera de repartidor' })
  @ApiResponse({ status: 200, schema: legacyAvailableOrdersResponse })
  async listAvailableOrders(@Req() req:MutationRequest) {
    return this.deliveryService.listAvailableOrders(req.user.id);
  }

  @Get('active-assignment')
  @ApiOperation({ summary: 'Obtener la entrega actualmente activa del repartidor' })
  @ApiResponse({ status: 200, schema: legacyActiveAssignmentResponse })
  async getActiveAssignment(@Req() req: { user: AuthenticatedUser }) {
    return this.deliveryService.getActiveAssignment(req.user.id);
  }

  @Post('orders/:id/claim')
  @ApiOperation({ summary: 'Repartidor toma un pedido listo para entrega (claim)' })
  @ApiResponse({ status: 201, schema: assignmentResponse })
  async claimOrder(
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto:VersionDto,
  ) {
    return this.deliveryService.claimOrder(id, req.user.id,dto?.expectedVersion,mutationActor(req as any));
  }

  @Post('assignments/:id/pickup')
  @ApiOperation({ summary: 'Repartidor retira pedido del comercio (descuenta stock físico on_hand)' })
  @ApiResponse({ status: 201, schema: pickupResponse })
  async pickupDelivery(
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto:VersionDto,
  ) {
    return this.deliveryService.pickupDelivery(id, req.user.id,dto?.expectedVersion,mutationActor(req as any));
  }

  @Post('assignments/:id/deliver')
  @ApiOperation({ summary: 'Repartidor entrega pedido al cliente (confirma cobro de efectivo)' })
  @ApiResponse({ status: 201, schema: deliveryResponse })
  async completeDelivery(
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto:DeliverCashDto,
  ) {
    return this.deliveryService.completeDelivery(id, req.user.id,dto.cashReceivedCents,dto.expectedVersion,mutationActor(req as any));
  }
  @Post('assignments/:id/release')
  @ApiResponse({ status: 201, schema: releaseResponse })
  release(@Param('id',ParseUUIDPipe) id:string,@Req() req:MutationRequest,@Body() dto:CancelOrderDto){return this.deliveryService.releaseAssignment(id,mutationActor(req),dto.reason,dto.expectedVersion);}
  @Post('assignments/:id/incidents')
  @ApiResponse({ status: 201, schema: incidentResponse })
  incident(@Param('id',ParseUUIDPipe) id:string,@Req() req:MutationRequest,@Body() dto:CancelOrderDto){return this.deliveryService.reportIncident(id,mutationActor(req),dto.reason,dto.expectedVersion);}
}

@Controller('api/v1/admin') @UseGuards(AuthGuard,RolesGuard) @Roles('admin') @ApiCookieAuth('cookie') @ApiTags('Intervención de reparto')
export class AdminDeliveryController{
  constructor(private readonly delivery:DeliveryService){}
  @Post('orders/:id/assignment')
  @ApiResponse({ status: 201, schema: assignmentResponse })
  assign(@Param('id',ParseUUIDPipe) id:string,@Req() req:MutationRequest,@Body() dto:AssignCourierDto){return this.delivery.claimOrder(id,dto.courierUserId,dto.expectedVersion,mutationActor(req),dto.reason);}
  @Post('assignments/:id/release')
  @ApiResponse({ status: 201, schema: releaseResponse })
  release(@Param('id',ParseUUIDPipe) id:string,@Req() req:MutationRequest,@Body() dto:CancelOrderDto){return this.delivery.releaseAssignment(id,mutationActor(req),dto.reason,dto.expectedVersion);}
}

@Controller('api/v1/merchant')
@UseGuards(AuthGuard, RolesGuard)
@Roles('merchant', 'admin')
@ApiCookieAuth('cookie')
@ApiTags('Asignación de reparto por comercio')
export class MerchantDeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('available-couriers')
  @ApiOperation({ summary: 'Listar repartidores disponibles para asignar pedido' })
  @ApiResponse({ status: 200, schema: availableCouriersResponse })
  async listAvailableCouriers(@Req() req: MutationRequest) {
    return this.delivery.listAvailableCouriers(req.user.id);
  }

  @Post('orders/:id/assign-courier')
  @ApiOperation({ summary: 'Comercio asigna un repartidor a su orden' })
  @ApiResponse({ status: 201, schema: assignmentResponse })
  async assignCourier(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: MutationRequest,
    @Body() dto: AssignCourierDto,
  ) {
    return this.delivery.claimOrder(id, dto.courierUserId, dto.expectedVersion, mutationActor(req), dto.reason);
  }

  @Get('couriers')
  @ApiOperation({ summary: 'Listar repartidores del comercio (asociados y de Tingo María)' })
  async listStoreCouriers(@Req() req: MutationRequest, @Query('storeId') storeId?: string) {
    return this.delivery.listStoreCouriers(req.user.id, storeId);
  }

  @Post('couriers')
  @ApiOperation({ summary: 'Asociar o agregar un repartidor a la tienda' })
  async associateCourier(
    @Req() req: MutationRequest,
    @Body() dto: AssociateCourierDto,
    @Query('storeId') storeId?: string,
  ) {
    return this.delivery.associateCourierToStore(req.user.id, dto, storeId);
  }

  @Delete('couriers/:courierUserId')
  @ApiOperation({ summary: 'Desvincular repartidor de la tienda' })
  async removeStoreCourier(
    @Req() req: MutationRequest,
    @Param('courierUserId', ParseUUIDPipe) courierUserId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.delivery.removeCourierFromStore(req.user.id, courierUserId, storeId);
  }

  @Get('delivery-history')
  @ApiOperation({ summary: 'Consultar historial de entregas y repartos de la tienda' })
  async getDeliveryHistory(@Req() req: MutationRequest, @Query('storeId') storeId?: string) {
    return this.delivery.getStoreDeliveryHistory(req.user.id, storeId);
  }
}

