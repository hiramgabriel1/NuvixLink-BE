import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { TurnstileController } from './turnstile.controller';
import { TurnstileService } from './turnstile.service';

describe('TurnstileController', () => {
  let controller: TurnstileController;
  let service: jest.Mocked<TurnstileService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TurnstileController],
      providers: [
        {
          provide: TurnstileService,
          useValue: {
            verifyToken: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TurnstileController>(TurnstileController);
    service = module.get(TurnstileService);
  });

  it('should proxy Cloudflare payload as-is on success', async () => {
    const cloudflarePayload = {
      success: true,
      challenge_ts: '2026-05-07T00:00:00.000Z',
      hostname: 'example.com',
    };

    service.verifyToken.mockResolvedValue(cloudflarePayload);

    const req = { ip: '127.0.0.1' } as Request;
    const result = await controller.verify({ token: 'token-123' }, req);

    expect(result).toEqual(cloudflarePayload);
    expect(service.verifyToken).toHaveBeenCalledWith('token-123', '127.0.0.1');
  });

  it('should throw missing-token when token is invalid', async () => {
    const req = { ip: '127.0.0.1' } as Request;

    await expect(controller.verify({ token: '' }, req)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should propagate upstream failure from service', async () => {
    const req = { ip: '127.0.0.1' } as Request;
    service.verifyToken.mockRejectedValue(new BadGatewayException({ error: 'turnstile-upstream' }));

    await expect(controller.verify({ token: 'token-123' }, req)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
