import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
      throw new ServiceUnavailableException(
        'S3 no esta configurado: define AWS_S3_BUCKET o S3_BUCKET (y en general AWS_REGION, credenciales).',
      );
    }
    return b;
  }

  /** `AWS_S3_BUCKET` o alias `S3_BUCKET` (mismo que puedes usar en el .env con Doppler). */
  static resolveBucketName(): string | undefined {
    const v = process.env.AWS_S3_BUCKET?.trim() || process.env.S3_BUCKET?.trim();
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
   * Subida directa (buffer) al bucket; útil p.ej. reportes o jobs server-side.
   */
  async putObject(params: { key: string; body: Buffer; contentType: string }): Promise<{ key: string }> {
    const bucket = this.bucket;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
        }),
      );
    } catch (e: unknown) {
      const name = (e as { name?: string }).name;
      const message = (e as { message?: string }).message;
      const detail = [name, message].filter(Boolean).join(': ');
      throw new ServiceUnavailableException(
        `Error al subir a S3: ${detail || 'revisa bucket, región, permisos PutObject e IAM'}`,
      );
    }
    return { key: params.key };
  }
}

