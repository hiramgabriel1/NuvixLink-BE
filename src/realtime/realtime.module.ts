import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { FeedGateway } from './feed.gateway';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev_secret_change_me',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [FeedGateway],
  exports: [FeedGateway],
})
export class RealtimeModule {}
