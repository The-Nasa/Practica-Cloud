import { Module } from '@nestjs/common';
import { MediaObjectsService } from './application/media-objects.service';
import { ProfileMediaService } from './application/profile-media.service';
import { ProfileMediaController } from './infrastructure/controllers/profile-media.controller';
@Module({ providers:[MediaObjectsService,ProfileMediaService],controllers:[ProfileMediaController],exports:[MediaObjectsService] })
export class MediaModule {}
