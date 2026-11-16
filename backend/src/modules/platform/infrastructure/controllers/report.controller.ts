import {Controller,Get,Param,ParseUUIDPipe,Query,Req,UseGuards} from '@nestjs/common';
import {ApiCookieAuth,ApiOkResponse} from '@nestjs/swagger';
import {AuthGuard} from '../../../../platform/guards/auth.guard';
import {MutationRequest} from '../../public';
import {ReportService} from '../../application/report.service';
import {AuditPage,AuditQuery,ReportQuery,ReportResult} from '../report.dto';
@Controller('api/v1') @UseGuards(AuthGuard) @ApiCookieAuth('cookie')
export class ReportController {
 constructor(private readonly service:ReportService){}
 @Get('admin/reports') @ApiOkResponse({type:ReportResult}) admin(@Req() r:MutationRequest,@Query() q:ReportQuery){return this.service.report(r.user.id,'admin',q);}
 @Get('merchant/stores/:id/reports') @ApiOkResponse({type:ReportResult}) merchant(@Req() r:MutationRequest,@Param('id',ParseUUIDPipe) id:string,@Query() q:ReportQuery){return this.service.report(r.user.id,'merchant',q,id);}
 @Get('courier/earnings') @ApiOkResponse({type:ReportResult}) courier(@Req() r:MutationRequest,@Query() q:ReportQuery){return this.service.report(r.user.id,'courier',q);}
 @Get('admin/audit') @ApiOkResponse({type:AuditPage}) audit(@Req() r:MutationRequest,@Query() q:AuditQuery){return this.service.audit(r.user.id,q);}
}
