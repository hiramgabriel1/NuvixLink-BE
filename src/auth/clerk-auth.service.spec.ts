import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ClerkAuthService } from './clerk-auth.service';

type PrismaUserMock = {
  findUnique: jest.Mock;
  update: jest.Mock;
  create: jest.Mock;
};

describe('ClerkAuthService.findOrCreateByClerk', () => {
  let service: ClerkAuthService;
  let userMock: PrismaUserMock;

  beforeEach(async () => {
    userMock = {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClerkAuthService,
        {
          provide: PrismaService,
          useValue: { user: userMock },
        },
      ],
    }).compile();

    service = module.get(ClerkAuthService);
  });

  it('returns existing user when clerkUserId already linked', async () => {
    const existing = { id: 'u1', clerkUserId: 'clerk_123', email: 'a@b.com', username: 'ada' };
    userMock.findUnique.mockResolvedValueOnce(existing);

    const result = await service.findOrCreateByClerk({ sub: 'clerk_123' });

    expect(userMock.findUnique).toHaveBeenCalledWith({ where: { clerkUserId: 'clerk_123' } });
    expect(result).toBe(existing);
  });

  it('attaches clerkUserId to existing user matched by email', async () => {
    userMock.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', clerkUserId: null });
    userMock.update.mockResolvedValueOnce({
      id: 'u1',
      email: 'a@b.com',
      clerkUserId: 'clerk_123',
    });

    const result = await service.findOrCreateByClerk({ sub: 'clerk_123', email: 'A@B.com' });

    expect(userMock.findUnique).toHaveBeenNthCalledWith(2, { where: { email: 'a@b.com' } });
    expect(userMock.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { clerkUserId: 'clerk_123', isVerified: true },
    });
    expect(result.clerkUserId).toBe('clerk_123');
  });

  it('creates a new user when no match found, using claims fallback', async () => {
    userMock.findUnique.mockResolvedValue(null);
    userMock.create.mockResolvedValueOnce({
      id: 'new',
      email: 'new@user.com',
      username: 'newuser',
      clerkUserId: 'clerk_new',
    });

    const result = await service.findOrCreateByClerk({
      sub: 'clerk_new',
      email: 'new@user.com',
      username: 'newuser',
    });

    expect(userMock.create).toHaveBeenCalledWith({
      data: {
        clerkUserId: 'clerk_new',
        email: 'new@user.com',
        username: 'newuser',
        isVerified: true,
      },
    });
    expect(result.id).toBe('new');
  });

  it('falls back to synthetic email/username when claims are missing', async () => {
    userMock.findUnique.mockResolvedValue(null);
    userMock.create.mockImplementationOnce(({ data }) => Promise.resolve({ id: 'x', ...data }));

    const result = await service.findOrCreateByClerk({ sub: 'abcdef1234567890' });

    expect(userMock.create).toHaveBeenCalledTimes(1);
    expect(result.email).toBe('abcdef1234567890@users.clerk.local');
    expect(result.username).toBe('user_34567890');
  });
});
