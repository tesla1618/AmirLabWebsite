import {
  IsEnum,
  IsOptional,
  IsInt,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ContributorMatchStatus } from '../../../generated/prisma/client';

export class ClaimContributorDto {
  @IsInt()
  @Min(0)
  expectedAutomationVersion!: number;

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  note?: string;
}

export class LinkContributorDto {
  @IsInt()
  @Min(0)
  expectedAutomationVersion!: number;

  @IsUUID()
  personId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  note?: string;
}

export class ReviewContributorMatchDto {
  @IsInt()
  @Min(0)
  expectedAutomationVersion!: number;

  @IsEnum(ContributorMatchStatus)
  status!: ContributorMatchStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  note?: string;
}
