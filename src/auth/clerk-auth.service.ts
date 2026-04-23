import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';
import { PrismaService } from '../prisma/prisma.service';

type ClerkClaims = JWTPayload & {
  email?: string;
  email_address?: string;
  primary_email_address?: string;
  username?: string;
  user_name?: string;
  name?: string;
  given_name?: string;
};

@Injectable()
export class ClerkAuthService {
  private readonly logger = new Logger(ClerkAuthService.name);
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  get isEnabled(): boolean {
    return Boolean(process.env.CLERK_ISSUER);
  }

  private getJwks() {
    if (!process.env.CLERK_ISSUER) {
      throw new UnauthorizedException('Clerk is not configured');
    }

    if (!this.jwks) {
      const issuer = process.env.CLERK_ISSUER.replace(/\/$/, '');
      const jwksUrl = new URL(`${issuer}/.well-known/jwks.json`);
      this.jwks = createRemoteJWKSet(jwksUrl);
    }

    return this.jwks;
  }

  async verifyToken(token: string): Promise<ClerkClaims> {
    try {
      const jwks = this.getJwks();
      const issuer = process.env.CLERK_ISSUER!.replace(/\/$/, '');
      const audience = process.env.CLERK_AUDIENCE || undefined;

      const { payload } = await jwtVerify(token, jwks, {
        issuer,
        audience,
      });

      if (!payload.sub) {
        throw new UnauthorizedException('Invalid Clerk token: missing sub');
      }

      return payload as ClerkClaims;
    } catch (error) {
      this.logger.debug(`Clerk token verification failed: ${(error as Error).message}`);
      throw new UnauthorizedException('Invalid Clerk token');
    }
  }

  async findOrCreateByClerk(claims: ClerkClaims): Promise<User> {
    const clerkUserId = claims.sub!;
    const email = this.extractEmail(claims);
    const preferredUsername = this.extractUsername(claims, email);

    const byClerkId = await this.prisma.user.findUnique({
      where: { clerkUserId },
    });
    if (byClerkId) return byClerkId;

    if (email) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (byEmail) {
        return this.prisma.user.update({
          where: { id: byEmail.id },
          data: { clerkUserId, isVerified: true },
        });
      }
    }

    const finalEmail = email
      ? email.toLowerCase()
      : `${clerkUserId}@users.clerk.local`;
    const finalUsername = await this.resolveUniqueUsername(preferredUsername);

    return this.prisma.user.create({
      data: {
        clerkUserId,
        email: finalEmail,
        username: finalUsername,
        isVerified: true,
      },
    });
  }

  private extractEmail(claims: ClerkClaims): string | undefined {
    return (
      claims.email ??
      claims.email_address ??
      claims.primary_email_address ??
      undefined
    );
  }

  private extractUsername(claims: ClerkClaims, email?: string): string {
    const raw =
      claims.username ??
      claims.user_name ??
      claims.given_name ??
      (email ? email.split('@')[0] : undefined) ??
      `user_${claims.sub!.slice(-8)}`;

    return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || `user_${claims.sub!.slice(-8)}`;
  }

  private async resolveUniqueUsername(desired: string): Promise<string> {
    const base = desired || 'user';
    let candidate = base;
    let counter = 1;

    while (await this.prisma.user.findUnique({ where: { username: candidate } })) {
      candidate = `${base}_${counter}`;
      counter++;
      if (counter > 50) {
        candidate = `${base}_${Date.now()}`;
        break;
      }
    }

    return candidate;
  }
}
