# nuvix-backend

Base backend en **NestJS**.

## Requisitos

- Node.js 20+ (ideal 22/24)

## Comandos

- Instalar dependencias: `npm i`
- Dev: `npm run start:dev`
- Build: `npm run build`
- Tests: `npm test` y `npm run test:e2e`

## API Docs

- Swagger UI: `GET /docs`
- Base URL local: `http://localhost:4000` (o el puerto definido en `PORT`)

## Autenticación

Los endpoints protegidos requieren un Bearer token JWT emitido por el propio backend:

```
Authorization: Bearer <access_token>
```

El token se obtiene de `POST /auth/login` (o `POST /auth/verify-email` tras registrarse). Si el token es inválido o no se envía → `401 Unauthorized`.

Endpoints protegidos:
- `POST /posts`
- `POST /posts/:postId/like` (me gusta)
- `DELETE /posts/:postId/like` (quitar me gusta)
- `GET /posts/bookmarks/me`
- `POST /posts/:postId/bookmark`
- `DELETE /posts/:postId/bookmark`
- `GET /users/my-profile`
- `PATCH /users/my-profile` (JSON o `multipart/form-data` con `photo`; sube a S3 bajo **`S3_USERS_FOLDER`**; prefijo por defecto **`profile-media/`**; en `photoKey` va la **URL pública** `https://<bucket>.s3.<region>.amazonaws.com/profile-media/...` con **`S3_BUCKET`** y **`AWS_REGION`**. Las subidas usan por defecto ACL **`public-read`** para que la URL abra en el navegador; si tu bucket bloquea ACLs, define **`S3_PROFILE_UPLOAD_ACL=off`** y una **política de bucket** que permita `s3:GetObject` en `arn:aws:s3:::TU_BUCKET/profile-media/*`. Ver sección [Foto de perfil y S3](#foto-de-perfil-y-s3). `s3:PutObject` / `s3:DeleteObject` en el rol de la app)
- `GET /users/me` (alias)
- `POST /auth/logout`
- `POST /reports`

## Reports

### `POST /reports` (Bearer token requerido)

**Que hace**
- Guarda un reporte asociado al usuario autenticado (quien reporta se guarda en `reporterId` en base de datos).
- Puedes enviar el cuerpo como **`application/json`** o como **`multipart/form-data`**.
- **Imagen subida a S3**: si envias un archivo en el part **`image`** (multipart, campo de archivo, no un string), el backend lo sube al bucket bajo el prefijo **`S3_REPORTS_PREFIX`** (nombre de carpeta en el bucket, ej. `reports/` o `moderation/reports/`; sin barra final se añade una) y guarda en la columna `image` la **clave completa** del objeto, p. ej. `<S3_REPORTS_PREFIX><reporterId>/<timestamp>-<hex>.png`. Si `S3_REPORTS_PREFIX` no está definido, se usa `reports/`. Necesitas **bucket y credenciales**: variable **`S3_BUCKET`** (o en su defecto `AWS_S3_BUCKET`), además de `AWS_REGION` y, en local, `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` con permisos `s3:PutObject` al bucket. Si S3 no está configurado o la subida falla, la API responde con **503** y un mensaje explicando el motivo (en lugar de un 500 genérico).
- **Sin archivo**: en JSON puedes enviar `image` como string (clave S3 existente, ruta, o según vuestro contrato) y no se llama a S3 para subir nada.
- **Archivo y string `image` a la vez**: se prioriza el archivo; el valor string de `image` se ignora.

**Campos (en JSON o en los campos de texto de multipart)**
- `typeReport` (obligatorio): string, max 50 (ej. categoría: `spam`, `harassment`, etc.)
- `title` (obligatorio): string, max 150
- `description` (opcional): string, max 3000
- `image` (opcional): en **JSON**, string, max 512 (clave o referencia; no sube a S3). En **multipart**, usar el part de **archivo** con nombre `image` para subir a S3.
- `url` (opcional): URL valida (ej. enlace a perfil o contenido reportado)
- `emailToContact` (opcional): email (ej. contacto de moderación si el flujo lo pide en el formulario)

**Restricciones de archivo (multipart)**
- Formatos: JPEG, PNG, GIF, WebP.
- Tamaño max: 5 MB.

**Ejemplo JSON**

```json
{
  "typeReport": "harassment",
  "title": "Comportamiento inapropiado en DM",
  "description": "Descripcion de lo ocurrido",
  "image": "photos/user/evidencia.png",
  "url": "https://nuvix.dev/users/usuario",
  "emailToContact": "mod@nuvix.dev"
}
```

**Ejemplo multipart (curl)**

```bash
curl -X POST http://localhost:4000/reports \
  -H "Authorization: Bearer <access_token>" \
  -F "typeReport=harassment" \
  -F "title=Comportamiento inapropiado" \
  -F "description=Detalles..." \
  -F "url=https://nuvix.dev/users/usuario" \
  -F "emailToContact=mod@nuvix.dev" \
  -F "image=@/ruta/local/captura.png;type=image/png"
```

**Respuesta (HTTP 201)**
- Devuelve el registro creado, incluyendo el `id` generado y `reporterId` (ID del usuario del token), mas los campos guardados y `createdAt` (ISO 8601). Tras subir a S3, el campo `image` contiene la clave del objeto (no la URL, salvo que envies en JSON un string con URL/clave).

```json
{
  "id": "clx...",
  "reporterId": "clx...",
  "typeReport": "harassment",
  "title": "Comportamiento inapropiado en DM",
  "description": "Descripcion de lo ocurrido",
  "image": "reports/clx..../1745601600000-a1b2c3d4.png",
  "url": "https://nuvix.dev/users/usuario",
  "emailToContact": "mod@nuvix.dev",
  "createdAt": "2026-04-24T12:00:00.000Z"
}
```

- Sin `Authorization: Bearer` o token invalido: `401 Unauthorized`.
- Imagen con tipo o tamaño no permitido: `400 Bad Request` (o error de multer por tamaño).

## Auth

### `POST /auth/register`

**Que hace**
- Registra una cuenta nueva.
- Crea un token de verificacion y envia correo via Resend.
- **No devuelve JWT** hasta que la cuenta se verifique.

**Que pide (body JSON)**
```json
{
  "email": "user@nuvix.dev",
  "password": "superSecret123",
  "username": "hiramdev",
  "puesto": "Backend Engineer",
  "description": "Opcional",
  "techStacks": ["NestJS", "Prisma"],
  "socialLinks": {
    "github": "https://github.com/hiramdev"
  }
}
```

**Respuesta esperada**
```json
{
  "message": "Account created. Please verify your email before logging in."
}
```

---

### `POST /auth/verify-email`

**Que hace**
- Verifica la cuenta usando el token enviado por correo.
- Marca `isVerified = true`.
- Devuelve JWT para iniciar sesion.

**Que pide (body JSON)**
```json
{
  "token": "token-recibido-en-correo"
}
```

---

### `POST /auth/login`

**Que hace**
- Inicia sesion con email/password.
- Solo permite login si el usuario ya verifico su correo.

**Que pide (body JSON)**
```json
{
  "email": "user@nuvix.dev",
  "password": "superSecret123"
}
```

**Respuesta esperada**
```json
{
  "accessToken": "jwt-token",
  "user": {
    "id": "clx...",
    "email": "user@nuvix.dev",
    "username": "hiramdev"
  }
}
```

## Posts

### `POST /posts` (Bearer token requerido)

**Que hace**
- Crea un post para el usuario autenticado.

**Que pide (body JSON)**
```json
{
  "title": "Mi post",
  "description": "Opcional",
  "media": ["posts/123/cover.png"],
  "website": "https://nuvix.dev",
  "tags": ["nestjs", "backend"],
  "isDraft": false
}
```

---

### `GET /posts`

**Que hace**
- Lista posts publicados (`isDraft = false`) ordenados por fecha.
- Cada post trae `likesCount` (cuántos likes tiene **ese** post) y `bookmarksCount`, además del autor. Los likes se guardan por `post` en la tabla de likes (un usuario, un post, una fila).

---

### `GET /posts/:id`

**Que hace**
- Devuelve detalle de un post por ID.
- Incluye autor, `likesCount` y `bookmarksCount` (totales de **ese** post).
- Para listar **quiénes** dieron like, usa `GET /posts/:postId/likes`.

---

### `GET /posts/:postId/likes` (público)

**Que hace**
- Lista quienes dieron me gusta a un post (solo posts publicados; si es borrador → `404`).
- Query: `limit` (1–200, default 50), `offset` (default 0).

**Respuesta ejemplo**
```json
{
  "postId": "clh...",
  "total": 3,
  "limit": 50,
  "offset": 0,
  "items": [
    { "userId": "clu...", "username": "dev", "photoKey": "https://...", "likedAt": "2025-01-15T10:00:00.000Z" }
  ]
}
```

---

### `POST /posts/:postId/like` (Bearer token requerido)

**Que hace**
- Añade un me gusta (idempotente: repetir no duplica filas). Devuelve el conteo total.

**Respuesta ejemplo**
```json
{ "liked": true, "likesCount": 12 }
```

---

### `DELETE /posts/:postId/like` (Bearer token requerido)

**Que hace**
- Quita tu me gusta. Devuelve el conteo total tras el borrado.

**Respuesta ejemplo**
```json
{ "liked": false, "likesCount": 11 }
```

---

### `GET /posts/bookmarks/me` (Bearer token requerido)

**Que hace**
- Lista los bookmarks del usuario autenticado.
- Incluye los posts guardados.

---

### `POST /posts/:postId/bookmark` (Bearer token requerido)

**Que hace**
- Guarda un post en bookmarks del usuario autenticado.
- Es idempotente (no duplica).

**Respuesta ejemplo**
```json
{
  "bookmarked": true
}
```

---

### `DELETE /posts/:postId/bookmark` (Bearer token requerido)

**Que hace**
- Quita un post de bookmarks del usuario autenticado.

**Respuesta ejemplo**
```json
{
  "bookmarked": false
}
```

## Users

### `GET /users/trending-builders`

**Que hace**
- Calcula ranking de builders por seguidores y/o likes recibidos en sus posts.

**Query params opcionales**
- `by`: `combined | followers | likes` (default: `combined`)
- `limit`: `1..100` (default: `10`)

**Ejemplo**
- `GET /users/trending-builders?by=combined&limit=10`

---

### `GET /users/my-profile` (Bearer token requerido)

**Que hace**
- Devuelve el perfil del usuario autenticado.
- Incluye conteos de followers/following/posts.
- Incluye bookmarks (ultimos 25) con sus posts.

### Foto de perfil y S3

Si la URL de `photoKey` devuelve **403 Access Denied** al abrirla en el navegador, el objeto sigue **privado** o el bucket bloquea lectura pública.

1. **Por defecto** el backend sube la imagen con ACL `public-read` (lectura anónima). Si el `PutObject` falla con un error de ACL, el bucket puede tener *Object Ownership: Bucket owner enforced* o *Block public access*: pon **`S3_PROFILE_UPLOAD_ACL=off`** en el entorno y usa solo política de bucket (recomendado en cuentas nuevas).
2. **Política de bucket** (sustituye `TU_BUCKET` por el **nombre real** de tu bucket, el mismo que en `S3_BUCKET`):

**Cómo aplicarla (consola AWS)**

1. Entra en [S3 en la consola](https://s3.console.aws.amazon.com/s3/buckets) y abre el bucket.
2. Pestaña **Permissions** (Permisos).
3. Baja a **Block public access (bucket settings)**. Si *Block all public access* está activo a nivel de bucket, pulsa **Edit** y desmarca al menos la opción que impide **policies** publicas, o el paso 5 fallará. AWS avisará; solo hazlo si aceptas lectura pública bajo el prefijo `profile-media/`.
4. Sigue en la misma pantalla, sección **Bucket policy** → **Edit**.
5. Pega el JSON de abajo (con tu nombre de bucket) y **Save changes**. Si el editor marca error de sintaxis, revisa comillas y el ARN.
6. Prueba en el navegador la URL de una foto que ya esté bajo `profile-media/...`; debería devolver 200, no 403.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadProfileMedia",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::TU_BUCKET/profile-media/*"
    }
  ]
}
```

**Con AWS CLI** (mismo JSON en un fichero `policy.json` y tu bucket en la región adecuada):

```bash
aws s3api put-bucket-policy --bucket TU_BUCKET --policy file://policy.json
```

Si no cambiaste *Block public access* en el bucket, el comando puede fallar o la política no surtirá efecto; en ese caso ajusta primero el bloqueo en la consola (paso 3).

3. **Objetos ya subidos** sin ACL pública: sigues viendo 403 hasta que o bien los vuelvas a subir con la nueva configuración o apliques `GetObject` vía política (la política cubre objetos existentes bajo esa ruta).

---

### `GET /users/:username`

**Que hace**
- Devuelve el perfil publico de un usuario por `username`.
- Incluye conteos de followers/following/posts.

## Health / Base

### `GET /`

**Que hace**
- Endpoint base de prueba, responde `Hello World!`.

