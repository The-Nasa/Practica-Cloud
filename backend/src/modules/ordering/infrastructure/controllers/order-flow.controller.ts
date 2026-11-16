import { ApiResponse } from '@nestjs/swagger';
import { orderCancellationResponse } from '../../../../platform/http/operation-response.schemas';
import {Body,Controller,Get,HttpCode,Param,ParseUUIDPipe,Post,Query,Req,UseGuards} from '@nestjs/common';
import {ApiCookieAuth,ApiOkResponse,ApiTags} from '@nestjs/swagger';
import {AuthGuard} from '../../../../platform/guards/auth.guard';
import {MutationRequest,mutationActor} from '../../../platform/public';
import {OrderFlowService} from '../../application/order-flow.service';
import {OrderingService} from '../../application/ordering.service';
import {CancelOrderDto,CreatePurchaseDto} from '../dto/ordering.dto';
import {CourierChoiceDto,OrderDetailDto,OrderPageDto,OrderQueryDto,QuoteDto} from '../dto/flow.dto';
@Controller('api/v1') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiTags('Flujo de compra y entrega')
export class OrderFlowController{
  constructor(private readonly flow:OrderFlowService,private readonly orders:OrderingService){}
  @Post('checkout/quote') @HttpCode(200) @ApiOkResponse({type:QuoteDto})
  quote(@Req() req:MutationRequest,@Body() dto:CreatePurchaseDto){return this.flow.quote(req.user.id,dto);}
  @Get('me/orders') @ApiOkResponse({type:OrderPageDto})
  own(@Req() req:MutationRequest,@Query() query:OrderQueryDto){return this.flow.list(req.user.id,'customer',query);}
  @Get('merchant/stores/:id/order-feed') @ApiOkResponse({type:OrderPageDto})
  merchant(@Req() req:MutationRequest,@Param('id',ParseUUIDPipe) id:string,@Query() query:OrderQueryDto){return this.flow.list(req.user.id,'merchant',query,id);}
  @Get('admin/orders') @ApiOkResponse({type:OrderPageDto})
  admin(@Req() req:MutationRequest,@Query() query:OrderQueryDto){return this.flow.list(req.user.id,'admin',query);}
  @Get('courier/orders') @ApiOkResponse({type:OrderPageDto})
  courier(@Req() req:MutationRequest,@Query() query:OrderQueryDto){return this.flow.list(req.user.id,'courier',query);}
  @Get('orders/:id') @ApiOkResponse({type:OrderDetailDto})
  detail(@Req() req:MutationRequest,@Param('id',ParseUUIDPipe) id:string){return this.flow.detail(req.user.id,id);}
  @Get('me/purchases/:id') @ApiOkResponse({type:OrderDetailDto})
  purchase(@Req() req:MutationRequest,@Param('id',ParseUUIDPipe) id:string){return this.flow.detail(req.user.id,id,true);}
  @Get('me/checkout-attempts/:key') @ApiOkResponse({type:OrderDetailDto})
  attempt(@Req() req:MutationRequest,@Param('key',ParseUUIDPipe) key:string){return this.flow.attempt(req.user.id,key);}
  @Post('merchant/orders/:id/rejections')
  @ApiResponse({ status: 201, schema: orderCancellationResponse })
  reject(@Req() req:MutationRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:CancelOrderDto){return this.orders.cancelOrder(id,req.user.id,dto,mutationActor(req),'rejected');}
  @Get('admin/courier-options') @ApiOkResponse({type:[CourierChoiceDto]})
  couriers(@Req() req:MutationRequest,@Query() query:OrderQueryDto){return this.flow.couriers(req.user.id,query.storeId);}
}
