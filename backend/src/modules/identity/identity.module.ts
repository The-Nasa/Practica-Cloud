import { Module } from '@nestjs/common';
import { PasswordHasher } from './domain/password.service';
import { IdentityService } from './application/identity.service';
import { AuthController } from './infrastructure/controllers/auth.controller';
import { AdminUsersService } from './application/admin-users.service';
import { AdminUsersController } from './infrastructure/controllers/admin-users.controller';

@Module({
  controllers: [AuthController, AdminUsersController],
  providers: [PasswordHasher, IdentityService, AdminUsersService],
  exports: [IdentityService],
})
export class IdentityModule {}
