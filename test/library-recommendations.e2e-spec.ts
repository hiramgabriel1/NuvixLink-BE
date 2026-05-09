import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('LibraryRecommendationsModule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('/library-recommendations (GET)', () => {
    it('should return an empty list initially', async () => {
      const response = await request(app.getHttpServer()).get('/library-recommendations');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: [], total: 0, limit: 20, offset: 0 });
    });
  });

  describe('/library-recommendations (POST)', () => {
    it('should create a new library recommendation', async () => {
      const payload = {
        ecosystem: 'npm',
        packageName: 'example-package',
        packageUrl: 'https://npmjs.com/package/example-package',
        installCommand: 'npm install example-package',
        description: 'An example package',
        useCase: 'Demonstration purposes',
      };

      const response = await request(app.getHttpServer())
        .post('/library-recommendations')
        .set('Authorization', 'Bearer <VALID_JWT>')
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject(payload);
    });
  });

  // Additional tests for DELETE, voting, and reporting endpoints can be added here
});