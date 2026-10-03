import { Type } from 'class-transformer';
import {
  IsDefined,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class PushKeysDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{87}$/)
  p256dh!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9_-]{22}$/)
  auth!: string;
}

export class PushEndpointDto {
  @IsString()
  @MaxLength(2048)
  endpoint!: string;
}

export class PushSubscriptionDto extends PushEndpointDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys!: PushKeysDto;
}
