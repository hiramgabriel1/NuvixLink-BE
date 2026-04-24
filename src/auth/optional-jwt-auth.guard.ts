import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * Si no hay `Authorization: Bearer`, no falla y deja `req.user` undefined.
 * Si hay token, aplica el JWT normal; si el token es inválido, sigue devolviendo 401.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<{ headers?: { authorization?: string } }>();
    const auth = request.headers?.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      (request as { user?: undefined }).user = undefined;
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser>(err: Error | null, user: TUser | false) {
    if (err) {
      throw err;
    }
    if (!user) {
      return undefined;
    }
    return user;
  }
}
