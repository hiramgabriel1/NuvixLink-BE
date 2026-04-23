import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { ClerkAuthService } from './clerk-auth.service';
import { PrismaService } from '../prisma/prisma.service';

type AuthenticatedUser = {
  userId: string;
  email: string;
  username: string;
  clerkUserId?: string;
};

type AuthRequest = Request & { user?: AuthenticatedUser };

type LocalJwtPayload = {
  sub: string;
  email: string;
  username: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly clerkAuthService: ClerkAuthService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    if (this.clerkAuthService.isEnabled) {
      try {
        const claims = await this.clerkAuthService.verifyToken(token);
        const user = await this.clerkAuthService.findOrCreateByClerk(claims);
        request.user = {
          userId: user.id,
          email: user.email,
          username: user.username,
          clerkUserId: user.clerkUserId ?? undefined,
        };
        return true;
      } catch (error) {
        if (!this.looksLikeLocalJwt(token)) {
          throw error;
        }
      }
    }

    return this.validateLocalToken(token, request);
  }

  private async validateLocalToken(token: string, request: AuthRequest): Promise<boolean> {
    let payload: LocalJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<LocalJwtPayload>(token, {
        secret: process.env.JWT_SECRET ?? 'dev_secret_change_me',
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    request.user = {
      userId: user.id,
      email: user.email,
      username: user.username,
      clerkUserId: user.clerkUserId ?? undefined,
    };
    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header || typeof header !== 'string') return null;
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token.trim();
  }

  private looksLikeLocalJwt(token: string): boolean {
    return token.split('.').length === 3;
  }
}
