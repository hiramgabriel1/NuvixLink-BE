import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [SurveysController],
  providers: [SurveysService],
})
export class SurveysModule {}
