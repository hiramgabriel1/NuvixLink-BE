import { HttpException, HttpStatus } from '@nestjs/common';

/** Cuerpo JSON unificado de error en la API. */
export type ApiErrorBody = {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
};

/**
 * Errores HTTP con `code` estable (además de statusCode/message de Nest).
 */
export class AppError {
  /** @internal */
  static throw(status: HttpStatus, code: string, message: string, details?: unknown): never {
    const body: ApiErrorBody = {
      statusCode: status,
      code,
      message,
    };
    if (details !== undefined) {
      body.details = details;
    }
    throw new HttpException(body, status);
  }

  static badRequest(code: string, message: string, details?: unknown): never {
    return this.throw(HttpStatus.BAD_REQUEST, code, message, details);
  }

  /** Para callbacks (p. ej. multer `fileFilter`) que deben recibir una `Error` sin lanzar aquí. */
  static httpBadRequest(code: string, message: string, details?: unknown): HttpException {
    const body: ApiErrorBody = {
      statusCode: HttpStatus.BAD_REQUEST,
      code,
      message,
    };
    if (details !== undefined) {
      body.details = details;
    }
    return new HttpException(body, HttpStatus.BAD_REQUEST);
  }

  static unauthorized(code: string, message: string): never {
    return this.throw(HttpStatus.UNAUTHORIZED, code, message);
  }

  static forbidden(code: string, message: string): never {
    return this.throw(HttpStatus.FORBIDDEN, code, message);
  }

  static notFound(code: string, message: string): never {
    return this.throw(HttpStatus.NOT_FOUND, code, message);
  }

  static conflict(code: string, message: string): never {
    return this.throw(HttpStatus.CONFLICT, code, message);
  }

  static internal(code: string, message: string, details?: unknown): never {
    return this.throw(HttpStatus.INTERNAL_SERVER_ERROR, code, message, details);
  }

  /** 503 */
  static serviceUnavailable(code: string, message: string): never {
    return this.throw(HttpStatus.SERVICE_UNAVAILABLE, code, message);
  }
}
