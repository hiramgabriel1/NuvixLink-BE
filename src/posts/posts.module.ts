import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { FeedGateway } from './feed.gateway';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PostsController],
  providers: [PostsService, FeedGateway],
  exports: [FeedGateway],
})
export class PostsModule {}

