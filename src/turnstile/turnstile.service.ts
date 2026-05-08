import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

export interface TurnstileVerifyResponse {
  success: boolean;
  [key: string]: unknown;
}

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const REQUEST_TIMEOUT_MS = 3_000;
const MAX_ATTEMPTS = 2;

class TurnstileUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TurnstileUpstreamError';
  }
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  async verifyToken(token: string, remoteIp?: string): Promise<TurnstileVerifyResponse> {
    const secret = process.env.NUVIX_TURNSTILE_SECRET?.trim();
    if (!secret) {
      this.logger.error('NUVIX_TURNSTILE_SECRET is not configured');
      throw new InternalServerErrorException({ error: 'internal' });
    }

    const form = new URLSearchParams();
    form.set('secret', secret);
    form.set('response', token);
    if (remoteIp?.trim()) {
      form.set('remoteip', remoteIp.trim());
    }

    let lastUpstreamError: TurnstileUpstreamError | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.callCloudflare(form);
      } catch (error) {
        if (!(error instanceof TurnstileUpstreamError)) {
          this.logger.error('Unexpected Turnstile verification error');
          throw new InternalServerErrorException({ error: 'internal' });
        }
        lastUpstreamError = error;
      }
    }

    const details = { message: lastUpstreamError?.message ?? 'Unexpected upstream error' };
    this.logger.warn('Turnstile upstream verification failed', details);
    throw new BadGatewayException({ error: 'turnstile-upstream', details });
  }

  private async callCloudflare(form: URLSearchParams): Promise<TurnstileVerifyResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new TurnstileUpstreamError(`Upstream responded with status ${response.status}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (await response.json()) as any;
      // LOG CRÍTICO
this.logger.debug(`Cloudflare Raw Response: ${JSON.stringify(payload)}`);

if (!payload.success) {
  this.logger.warn(`Cloudflare rejected token. Error codes: ${payload['error-codes']}`);
}
      if (!this.isTurnstilePayload(payload)) {
        throw new TurnstileUpstreamError('Unexpected upstream payload shape');
      }

      return payload;
    } catch (error) {
      if (error instanceof TurnstileUpstreamError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TurnstileUpstreamError('Turnstile request timeout');
      }

      if (error instanceof Error) {
        throw new TurnstileUpstreamError(error.message);
      }

      throw new TurnstileUpstreamError('Unknown upstream error');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isTurnstilePayload(payload: unknown): payload is TurnstileVerifyResponse {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'success' in payload &&
      typeof (payload as { success?: unknown }).success === 'boolean'
    );
  }
}
