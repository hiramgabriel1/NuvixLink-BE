import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PostsModule } from '../posts/posts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DiscussionsController } from './discussions.controller';
import { DiscussionsService } from './discussions.service';

@Module({
  imports: [PrismaModule, AuthModule, PostsModule],
  controllers: [DiscussionsController],
  providers: [DiscussionsService],
})
export class DiscussionsModule {}
