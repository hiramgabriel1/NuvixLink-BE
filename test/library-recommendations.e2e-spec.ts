import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

describe('LibraryRecommendationsModule (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authUserId = '';
  let ownerId = '';
  let otherUserId = '';
  let recommendationId = '';

  const jwtGuardMock: CanActivate = {
    canActivate(context: ExecutionContext): boolean {
      const req = context
        .switchToHttp()
        .getRequest<{ user?: { userId: string; email: string; username: string } }>();
      req.user = {
        userId: authUserId,
        email: 'e2e@example.com',
        username: 'e2e-user',
      };
      return true;
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JwtAuthGuard)
      .useValue(jwtGuardMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.$connect();

    const owner = await prisma.user.upsert({
      where: { email: 'owner.library.e2e@example.com' },
      update: {
        username: 'owner_library_e2e',
        password: 'password_hash',
        isVerified: true,
      },
      create: {
        email: 'owner.library.e2e@example.com',
        password: 'password_hash',
        username: 'owner_library_e2e',
        isVerified: true,
      },
    });

    const other = await prisma.user.upsert({
      where: { email: 'other.library.e2e@example.com' },
      update: {
        username: 'other_library_e2e',
        password: 'password_hash',
        isVerified: true,
      },
      create: {
        email: 'other.library.e2e@example.com',
        password: 'password_hash',
        username: 'other_library_e2e',
        isVerified: true,
      },
    });

    ownerId = owner.id;
    otherUserId = other.id;
    authUserId = ownerId;
  });

  afterAll(async () => {
    await prisma.libraryRecommendationVote.deleteMany({
      where: { recommendationId },
    });
    await prisma.libraryRecommendationReport.deleteMany({
      where: { recommendationId },
    });
    if (recommendationId) {
      await prisma.libraryRecommendation.deleteMany({ where: { id: recommendationId } });
    }
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, otherUserId] } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  describe('/library-recommendations', () => {
    it('should create a new library recommendation', async () => {
      const payload = {
        ecosystem: 'npm',
        packageName: 'library-e2e-package',
        packageUrl: 'https://npmjs.com/package/library-e2e-package',
        installCommand: 'npm install library-e2e-package',
        description: 'An example package',
        useCase: 'Demonstration purposes',
      };

      const response = await request(app.getHttpServer())
        .post('/library-recommendations')
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject(payload);
      recommendationId = response.body.id;
      expect(recommendationId).toBeTruthy();
    });

    it('should get a recommendation by id', async () => {
      const response = await request(app.getHttpServer()).get(
        `/library-recommendations/${recommendationId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(recommendationId);
      expect(response.body.author.id).toBe(ownerId);
    });

    it('should allow owner to update recommendation', async () => {
      authUserId = ownerId;

      const response = await request(app.getHttpServer())
        .put(`/library-recommendations/${recommendationId}`)
        .send({
          description: 'Updated description by owner',
          useCase: 'Updated use case',
        });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe('Updated description by owner');
      expect(response.body.useCase).toBe('Updated use case');
    });

    it('should forbid update by non-owner', async () => {
      authUserId = otherUserId;

      const response = await request(app.getHttpServer())
        .put(`/library-recommendations/${recommendationId}`)
        .send({
          description: 'Trying to update another user recommendation',
        });

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent recommendation id', async () => {
      const response = await request(app.getHttpServer()).get(
        '/library-recommendations/00000000-0000-0000-0000-000000000000',
      );

      expect(response.status).toBe(404);
    });

    it('should allow voting and toggling vote', async () => {
      authUserId = ownerId;

      const likeResponse = await request(app.getHttpServer())
        .post(`/library-recommendations/${recommendationId}/vote`)
        .send({ value: 1 });

      expect(likeResponse.status).toBe(201);
      expect(likeResponse.body).toEqual({ voteCount: 1, userVote: 1 });

      const toggleResponse = await request(app.getHttpServer())
        .post(`/library-recommendations/${recommendationId}/vote`)
        .send({ value: 1 });

      expect(toggleResponse.status).toBe(201);
      expect(toggleResponse.body).toEqual({ voteCount: 0, userVote: null });

      const dislikeResponse = await request(app.getHttpServer())
        .post(`/library-recommendations/${recommendationId}/vote`)
        .send({ value: -1 });

      expect(dislikeResponse.status).toBe(201);
      expect(dislikeResponse.body).toEqual({ voteCount: -1, userVote: -1 });
    });

    it('should allow report and reject duplicate report', async () => {
      authUserId = otherUserId;

      const firstReport = await request(app.getHttpServer())
        .post(`/library-recommendations/${recommendationId}/report`)
        .send({ reason: 'Spam content for test' });

      expect(firstReport.status).toBe(201);
      expect(firstReport.body.id).toBeTruthy();

      const duplicateReport = await request(app.getHttpServer())
        .post(`/library-recommendations/${recommendationId}/report`)
        .send({ reason: 'Duplicate report attempt' });

      expect(duplicateReport.status).toBe(400);
    });

    it('should forbid delete by non-owner', async () => {
      authUserId = otherUserId;

      const response = await request(app.getHttpServer()).delete(
        `/library-recommendations/${recommendationId}`,
      );

      expect(response.status).toBe(403);
    });

    it('should allow delete by owner', async () => {
      authUserId = ownerId;

      const response = await request(app.getHttpServer()).delete(
        `/library-recommendations/${recommendationId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(recommendationId);
    });

    it('should return 404 after recommendation is deleted', async () => {
      const response = await request(app.getHttpServer()).get(
        `/library-recommendations/${recommendationId}`,
      );

      expect(response.status).toBe(404);
    });
  });
});
