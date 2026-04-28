import { Injectable } from '@nestjs/common';
import { AppError, ErrorCode } from '../common/errors';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
  private readonly client = new S3Client({
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });

  private get bucket() {
    const b = S3Service.resolveBucketName();
    if (!b) {
      AppError.serviceUnavailable(
        ErrorCode.STORAGE_NOT_CONFIGURED,
        'S3 no esta configurado: define S3_BUCKET (o AWS_S3_BUCKET) y, en general, AWS_REGION y credenciales.',
      );
    }
    return b;
  }

  /** Nombre del bucket: `S3_BUCKET` o, en su defecto, `AWS_S3_BUCKET`. */
  static resolveBucketName(): string | undefined {
    const v = process.env.S3_BUCKET?.trim() || process.env.AWS_S3_BUCKET?.trim();
    return v || undefined;
  }

  /**
   * Create a photo upload URL
   * @param params - The parameters for the photo upload URL
   * @returns The photo upload URL
   */
  async createPhotoUploadUrl(params: { key: string; contentType: string; expiresInSec?: number }) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn: params.expiresInSec ?? 300 });
  }

  /**
   * Create a photo read URL
   * @param params - The parameters for the photo read URL
   * @returns The photo read URL
   */
  async createPhotoReadUrl(params: { key: string; expiresInSec?: number }) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
    });

    return getSignedUrl(this.client, command, { expiresIn: params.expiresInSec ?? 300 });
  }

  /**
   * Base pública **opcional** (sin / final) si quieres otra raíz (dominio, proxy, etc.).
   * Si no está, la URL pública se arma con el patrón estándar S3, sin CloudFront.
   */
  static resolveUserPhotoPublicBase(): string | undefined {
    const u =
      process.env.S3_USER_PHOTO_BASE_URL?.trim() || process.env.S3_USER_MEDIA_PUBLIC_BASE?.trim();
    if (!u) {
      return undefined;
    }
    return u;
  }

  static resolveAwsRegion(): string {
    const r = (process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1').trim();
    return r || 'us-east-1';
  }

  /**
   * PutObject: ACL solo si el bucket aún las admite. Con *Object ownership: bucket owner* no hay ACLs → error
   * `AccessControlListNotSupported`. Por defecto **no** se envía ACL; la lectura pública se hace con **política de bucket** en el prefijo.
   * Opt-in: `S3_OBJECT_PUBLIC_ACL=public-read` o `S3_PROFILE_UPLOAD_ACL=public-read` (ambos aceptan `public-read`).
   */
  static publicObjectWriteAcl(): 'public-read' | undefined {
    const a =
      process.env.S3_OBJECT_PUBLIC_ACL?.trim().toLowerCase() ||
      process.env.S3_PROFILE_UPLOAD_ACL?.trim().toLowerCase();
    if (a === 'public-read' || a === 'public_read') {
      return 'public-read';
    }
    return undefined;
  }

  /**
   * URL pública a guardar en `User.photoKey` al subir a `s3ObjectKey`.
   * Sin `S3_USER_PHOTO_BASE_URL`: `https://<bucket>.s3.<region>.amazonaws.com/<key>` (virtual-hosted).
   * Necesitas lectura pública (p. ej. `GetObject` en el prefijo) u `ObjectOwnership` adecuado; no hace falta CloudFront.
   */
  static publicUrlForObjectKey(s3ObjectKey: string): string {
    const custom = S3Service.resolveUserPhotoPublicBase();
    if (custom) {
      return `${custom.replace(/\/$/, '')}/${s3ObjectKey.replace(/^\//, '')}`;
    }
    const bucket = S3Service.resolveBucketName();
    if (!bucket) {
      AppError.serviceUnavailable(
        ErrorCode.STORAGE_NOT_CONFIGURED,
        'Define S3_BUCKET (o AWS_S3_BUCKET) y AWS_REGION para armar la URL pública S3 de la foto.',
      );
    }
    const region = S3Service.resolveAwsRegion();
    const rel = s3ObjectKey.replace(/^\//, '');
    const path = rel
      .split('/')
      .map((p) => encodeURIComponent(p))
      .join('/');
    return `https://${bucket}.s3.${region}.amazonaws.com/${path}`;
  }

  /**
   * Para DeleteObject: valor guardado (URL pública o clave) → clave S3.
   * Si no se puede interpretar, devuelve null (no se borra en S3).
   */
  static objectKeyFromStoredUserPhoto(value: string | null | undefined): string | null {
    if (value == null) {
      return null;
    }
    const t = value.trim();
    if (!t) {
      return null;
    }
    if (!/^https?:\/\//i.test(t)) {
      return t;
    }
    const publicBase = S3Service.resolveUserPhotoPublicBase();
    if (publicBase) {
      const b = publicBase.replace(/\/$/, '');
      if (t === b) {
        return null;
      }
      if (t.startsWith(b + '/')) {
        return t.slice((b + '/').length) || null;
      }
    }
    try {
      const path = new URL(t).pathname.replace(/^\//, '');
      if (path) {
        return path.split('/').map((s) => decodeURIComponent(s)).join('/');
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * `acl` opcional: muchos buckets no permiten ACLs. Sin ACL, aplica `GetObject` por prefijo en la política del bucket.
   */
  async putObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
    /** Solo si pones `S3_OBJECT_PUBLIC_ACL=public-read` (y el bucket acepta ACLs). */
    acl?: 'public-read';
  }): Promise<{ key: string }> {
    const bucket = this.bucket;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
          ...(params.acl ? { ACL: params.acl } : {}),
        }),
      );
    } catch (e: unknown) {
      const name = (e as { name?: string }).name;
      const message = (e as { message?: string }).message;
      const detail = [name, message].filter(Boolean).join(': ');
      AppError.serviceUnavailable(
        ErrorCode.STORAGE_PUT_FAILED,
        `Error al subir a S3: ${detail || 'revisa bucket, región, permisos PutObject e IAM'}`,
      );
    }
    return { key: params.key };
  }

  /**
   * Borrado idempotente; si S3 no está configurado, no hace nada. Errores de red/permisos se ignoran (mejor el perfil quede coherente que fallar el PATCH).
   */
  async deleteObjectBestEffort(params: { key: string }): Promise<void> {
    if (!S3Service.resolveBucketName()) {
      return;
    }
    const bucket = this.bucket;
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: params.key,
        }),
      );
    } catch {
      // best-effort
    }
  }
}

