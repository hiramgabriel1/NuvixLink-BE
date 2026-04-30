import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AppError, ErrorCode } from '../common/errors';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      AppError.internal(ErrorCode.CONFIG_DATABASE_URL_MISSING, 'DATABASE_URL is not set');
    }
    const pool = new Pool({ connectionString });
    super({
      adapter: new PrismaPg(pool),
    });
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.SKIP_PRISMA_CONNECT === 'true') {
      return;
    }

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
