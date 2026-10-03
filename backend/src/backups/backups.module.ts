import { Module } from '@nestjs/common';
import { BackupsController } from './backups.controller';

@Module({ controllers: [BackupsController] })
export class BackupsModule {}
