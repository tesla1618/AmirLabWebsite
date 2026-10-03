import { Controller, Get } from '@nestjs/common';
import { PlatformRole } from '../../generated/prisma/client';
import { RequireRole } from '../auth/auth.decorators';

/** Provider-independent contract; capture and restore stay unavailable until storage is selected. */
export interface BackupStatus {
  configured: boolean;
  provider: string | null;
  canBackup: boolean;
  canRestore: boolean;
  lastBackup: { id: string; createdAt: string; verified: boolean } | null;
  reason: 'STORAGE_NOT_CONFIGURED' | null;
}

@Controller('backups')
@RequireRole(PlatformRole.ADMIN)
export class BackupsController {
  @Get('status')
  status(): BackupStatus {
    return {
      configured: false,
      provider: null,
      canBackup: false,
      canRestore: false,
      lastBackup: null,
      reason: 'STORAGE_NOT_CONFIGURED',
    };
  }
}
