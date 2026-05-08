import { BadGatewayException, InternalServerErrorException } from '@nestjs/common';
import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
  let service: TurnstileService;

  beforeEach(() => {
    service = new TurnstileService();
    process.env.NUVIX_TURNSTILE_SECRET = 'test-secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.NUVIX_TURNSTILE_SECRET;
  });

  it('should return Cloudflare payload on successful verification', async () => {
    const cloudflarePayload = {
      success: true,
      challenge_ts: '2026-05-07T00:00:00.000Z',
      hostname: 'example.com',
    };

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(cloudflarePayload),
    } as unknown as Response);

    const result = await service.verifyToken('token-123', '127.0.0.1');

    expect(result).toEqual(cloudflarePayload);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
  });

  it('should throw BadGatewayException when upstream fails after retries', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(service.verifyToken('token-123')).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('should throw InternalServerErrorException when secret is not configured', async () => {
    delete process.env.NUVIX_TURNSTILE_SECRET;

    await expect(service.verifyToken('token-123')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
