import { Module } from '@nestjs/common';
import { SessionManagementService } from './session-management.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailChangeService } from './email-change.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, EmailChangeService, SessionManagementService],
  exports: [AuthService, EmailChangeService, SessionManagementService],
})
export class AuthModule {}
