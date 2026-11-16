import {Body,Controller,Delete,Get,HttpCode,Param,ParseUUIDPipe,Post,Put,Query,Req,UseGuards} from '@nestjs/common';
import {ApiCookieAuth,ApiOkResponse,ApiCreatedResponse} from '@nestjs/swagger';
import {AuthGuard} from '../../platform/guards/auth.guard';
import {ListQueryDto} from '../../platform/http/list-query.dto';
import {MutationRequest,mutationActor} from '../platform/public';
import {EngagementService} from './engagement.service';
import {FavoritePage,ReviewInput,ReviewItem,ReviewPage} from './engagement.dto';
@Controller('api/v1')
export class EngagementController {
 constructor(private readonly service:EngagementService){}
 @Get('me/favorites') @UseGuards(AuthGuard) @ApiCookieAuth('cookie') @ApiOkResponse({type:FavoritePage})
 favorites(@Req() r:MutationRequest,@Query() q:ListQueryDto){return this.service.favorites(r.user.id,q);}
 @Put('me/favorites/products/:id') @UseGuards(AuthGuard) @HttpCode(204)
 addProduct(@Req() r:MutationRequest,@Param('id',ParseUUIDPipe) id:string){return this.service.favorite(mutationActor(r),'products',id,true);}
 @Delete('me/favorites/products/:id') @UseGuards(AuthGuard) @HttpCode(204)
 removeProduct(@Req() r:MutationRequest,@Param('id',ParseUUIDPipe) id:string){return this.service.favorite(mutationActor(r),'products',id,false);}
 @Put('me/favorites/stores/:id') @UseGuards(AuthGuard) @HttpCode(204)
 addStore(@Req() r:MutationRequest,@Param('id',ParseUUIDPipe) id:string){return this.service.favorite(mutationActor(r),'stores',id,true);}
 @Delete('me/favorites/stores/:id') @UseGuards(AuthGuard) @HttpCode(204)
 removeStore(@Req() r:MutationRequest,@Param('id',ParseUUIDPipe) id:string){return this.service.favorite(mutationActor(r),'stores',id,false);}
 @Post('orders/:id/reviews') @UseGuards(AuthGuard) @ApiCreatedResponse({type:ReviewItem})
 review(@Req() r:MutationRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:ReviewInput){return this.service.review(mutationActor(r),id,d);}
 @Get('stores/:id/reviews') @ApiOkResponse({type:ReviewPage})
 reviews(@Param('id',ParseUUIDPipe) id:string,@Query() q:ListQueryDto){return this.service.reviews(id,q);}
}
