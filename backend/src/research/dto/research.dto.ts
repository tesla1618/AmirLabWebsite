import { Transform, type TransformFnParams } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  type ValidationArguments,
} from 'class-validator';
import {
  ResearchItemType,
  ReviewStatus,
} from '../../../generated/prisma/client';

export class SubmitResearchDto {
  @IsIn([ResearchItemType.PAPER, ResearchItemType.DATASET])
  type!: ResearchItemType;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  canonicalUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8_000)
  summary?: string;

  @IsOptional()
  @IsUUID()
  submitterPersonId?: string;

  @Transform(({ value }: TransformFnParams) => {
    const contributors: unknown = value;
    return Array.isArray(contributors)
      ? contributors.map((name: unknown) =>
          typeof name === 'string' ? name.trim() : name,
        )
      : contributors;
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  contributors!: string[];

  @IsOptional()
  @IsBoolean()
  publishNow?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;

  @IsOptional()
  @AllowedFor(ResearchItemType.PAPER)
  @IsString()
  @MaxLength(200)
  doi?: string;

  @IsOptional()
  @AllowedFor(ResearchItemType.PAPER)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;

  @IsOptional()
  @AllowedFor(ResearchItemType.PAPER)
  @IsString()
  @MaxLength(300)
  venue?: string;

  @IsOptional()
  @AllowedFor(ResearchItemType.PAPER)
  @IsString()
  @MaxLength(120)
  publicationType?: string;

  @IsOptional()
  @AllowedFor(ResearchItemType.PAPER)
  @IsString()
  @MaxLength(4_000)
  citation?: string;

  @IsOptional()
  @AllowedFor(ResearchItemType.DATASET)
  @IsString()
  @MaxLength(100)
  version?: string;

  @IsOptional()
  @AllowedFor(ResearchItemType.DATASET)
  @IsString()
  @MaxLength(200)
  license?: string;

  @IsOptional()
  @AllowedFor(ResearchItemType.DATASET)
  @IsString()
  @MaxLength(200)
  modality?: string;

  @IsOptional()
  @AllowedFor(ResearchItemType.DATASET)
  @IsString()
  @MaxLength(4_000)
  accessNotes?: string;
}

export class UpdateResearchDto extends SubmitResearchDto {
  @IsInt()
  @Min(0)
  expectedAutomationVersion!: number;
}

export class VerifyResearchSourceDto {
  @IsInt()
  @Min(0)
  expectedAutomationVersion!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(4_000)
  note!: string;
}

class ResearchDecisionDto {
  @IsIn([
    ReviewStatus.NEEDS_REVIEW,
    ReviewStatus.PUBLISHED,
    ReviewStatus.REJECTED,
    ReviewStatus.CHANGES_REQUESTED,
  ])
  status!: ReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  note?: string;
}

export class ReviewResearchDto extends ResearchDecisionDto {
  @IsInt()
  @Min(0)
  expectedAutomationVersion!: number;
}

export class BulkReviewResearchDto extends ResearchDecisionDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  ids!: string[];

  // Revisions correspond to ids by index; the service requires equal lengths.
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Min(0, { each: true })
  expectedAutomationVersions!: number[];
}

function AllowedFor(...types: ResearchItemType[]): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'allowedForResearchType',
      target: target.constructor,
      propertyName: propertyName.toString(),
      constraints: types,
      validator: {
        validate(_value: unknown, arguments_: ValidationArguments) {
          return types.includes((arguments_.object as SubmitResearchDto).type);
        },
        defaultMessage(arguments_: ValidationArguments) {
          return `${arguments_.property} is only allowed for ${types
            .map((type) => type.toLowerCase())
            .join(' or ')} submissions`;
        },
      },
    });
}
