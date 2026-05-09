import { Module } from '@nestjs/common';
import { TurnstileController } from './turnstile.controller';
import { TurnstileService } from './turnstile.service';

@Module({
  controllers: [TurnstileController],
  providers: [TurnstileService],
})
export class TurnstileModule {}
