import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PushSubscriptionDto } from './push-subscription.dto';

describe('PushSubscriptionDto', () => {
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/device',
    keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
  };

  it('accepts a browser subscription with base64url keys', async () => {
    expect(
      await validate(plainToInstance(PushSubscriptionDto, subscription)),
    ).toEqual([]);
  });

  it.each([
    { endpoint: subscription.endpoint },
    { ...subscription, keys: { p256dh: 'bad', auth: 'bad' } },
    { ...subscription, keys: 'not-an-object' },
    { ...subscription, endpoint: 'x'.repeat(2049) },
  ])('rejects missing, malformed, or excessive fields', async (value) => {
    expect(
      await validate(plainToInstance(PushSubscriptionDto, value)),
    ).not.toEqual([]);
  });
});
