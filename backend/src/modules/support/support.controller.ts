import {Body,Controller,Get,HttpCode,Param,ParseUUIDPipe,Post,Query,Req,UseGuards} from '@nestjs/common';
import {ApiCookieAuth,ApiCreatedResponse,ApiOkResponse} from '@nestjs/swagger';
import {AuthGuard} from '../../platform/guards/auth.guard';
import {ListQueryDto} from '../../platform/http/list-query.dto';
import {mutationActor,MutationRequest} from '../platform/public';
import {SupportService} from './support.service';
import {MessageInput,TicketInput,TicketDecision,TicketDetail,TicketItem,TicketPage} from './support.dto';
@Controller('api/v1') @UseGuards(AuthGuard) @ApiCookieAuth('cookie')
export class SupportController {
 constructor(private readonly service:SupportService){}
 @Get('me/tickets') @ApiOkResponse({type:TicketPage}) list(@Req() r:MutationRequest,@Query() q:ListQueryDto){return this.service.list(r.user.id,q);}
 @Get('admin/tickets') @ApiOkResponse({type:TicketPage}) adminList(@Req() r:MutationRequest,@Query() q:ListQueryDto){return this.service.list(r.user.id,q,true);}
 @Get('me/tickets/:id') @ApiOkResponse({type:TicketDetail}) detail(@Req() r:MutationRequest,@Param('id',ParseUUIDPipe) id:string){return this.service.detail(r.user.id,id);}
 @Get('admin/tickets/:id') @ApiOkResponse({type:TicketDetail}) adminDetail(@Req() r:MutationRequest,@Param('id',ParseUUIDPipe) id:string){return this.service.detail(r.user.id,id,true);}
 @Post('me/tickets') @ApiCreatedResponse({type:TicketItem}) create(@Req() r:MutationRequest,@Body() d:TicketInput){return this.service.create(mutationActor(r),d);}
 @Post('tickets/:id/messages') @HttpCode(204) message(@Req() r:MutationRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:MessageInput){return this.service.message(mutationActor(r),id,d.body);}
 @Post('admin/tickets/:id/decisions') @HttpCode(204) decide(@Req() r:MutationRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:TicketDecision){return this.service.message(mutationActor(r),id,d.body,d);}
}
