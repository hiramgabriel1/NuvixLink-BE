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
- Base URL local: el puerto por defecto del servidor (ver `PORT` en `.env` / `main.ts`).

## Tiempo real (WebSocket, Socket.IO)

Mismo **host y puerto** que el HTTP (no hay puerto extra). Tras levantar el servidor, el front puede conectar con **`socket.io-client`**.

- **Eventos del servidor**
  - **`post:created`** — un post con la **misma forma** que cada elemento de `GET /posts` → `data[]` (mismo `id` que `POST /posts` para deduplicar). Solo si el post **no** es borrador.
  - **`comment:created`** — `{ postId, comment, commentsCount }`. `comment` igual que un ítem de `GET /posts/:postId/comments` → `items[]`. `commentsCount` = total de comentarios del post tras crear.
  - **`comment:updated`** — `{ postId, comment }` (misma forma de `comment` que arriba).
  - **`comment:deleted`** — `{ postId, commentId, commentsCount }` (total tras borrar).
- CORS: mismos orígenes que el API (`CORS_ORIGIN` separada por comas, o `http://localhost:3000`).

Ejemplo mínimo (React, etc.):

```ts
import { io } from 'socket.io-client';

const base = import.meta.env.VITE_API_URL ?? 'http://localhost:5001';
const socket = io(base, { withCredentials: true, transports: ['websocket', 'polling'] });
socket.on('post:created', (post) => {
  // Anteponer al feed
});
socket.on('comment:created', ({ postId, comment, commentsCount }) => {
  // Si abriste ese post: añadir comentario; actualizar badge con commentsCount
});
socket.on('comment:updated', ({ postId, comment }) => { /* … */ });
socket.on('comment:deleted', ({ postId, commentId, commentsCount }) => { /* … */ });
```

## Autenticación

Los endpoints protegidos requieren un Bearer token JWT emitido por el propio backend:

```
Authorization: Bearer <access_token>
```

El token se obtiene de `POST /auth/login` (o `POST /auth/verify-email` tras registrarse). Si el token es inválido o no se envía → `401 Unauthorized`.

Endpoints protegidos:
- `POST /posts`
- `DELETE /posts/:postId` (solo el autor del post)
- `POST /posts/:postId/like` (me gusta)
- `DELETE /posts/:postId/like` (quitar me gusta)
- `GET /posts/bookmarks/me`
- `POST /posts/:postId/bookmark`
- `DELETE /posts/:postId/bookmark`
- `GET /posts/:postId/comments` (listar comentarios; paginado `limit`/`offset`)
- `POST /posts/:postId/comments` (crear comentario; Bearer)
- `PATCH /posts/:postId/comments/:commentId` (editar; solo autor; Bearer)
- `DELETE /posts/:postId/comments/:commentId` (borrar; solo autor del comentario; Bearer)
- `GET /users/my-profile`
- `PATCH /users/my-profile` (JSON o `multipart/form-data` con `photo`; sube a S3 bajo **`S3_USERS_FOLDER`**; prefijo por defecto **`profile-media/`**; en `photoKey` va la **URL pública**). Por defecto **no** se envía ACL a S3 (compatible con *Bucket owner*); hace falta **política de bucket** con `s3:GetObject` al prefijo (ej. `profile-media/*`). Opcional, solo si el bucket acepta ACLs: `S3_OBJECT_PUBLIC_ACL=public-read` o el alias `S3_PROFILE_UPLOAD_ACL=public-read`. Ver [Lectura pública en S3](#lectura-pública-en-s3-fotos-de-perfil-y-de-posts).)
- `GET /users/me` (alias)
- `GET /users/me/follow-counts` (seguidores y siguiendo; solo contadores)
- `POST /users/:username/follow` (seguir; idempotente)
- `DELETE /users/:username/follow` (dejar de seguir; idempotente)
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
- Acepta **`application/json`** o **`multipart/form-data`**.

**JSON**
- `title` (obligatorio), resto opcional.
- `media` es un **array de strings** (URLs o claves S3 **ya** subidas con otro flujo, si aplica). Sin imágenes en el mismo request.

**Multipart (subir fotos con el post)**
- Mismos campos de texto que en JSON (`title`, `description`, `website`, `tags`, `isDraft`; en form puedes enviar `tags` como `a, b, c` o un string JSON de array; `isDraft` como `true`/`false`).
- Archivos: uno o varios en el part **`files`** (nombre repetido, máx. 20, 5 MB cada uno). Se suben a S3 bajo el prefijo **`S3_POSTS_FOLDER`** (por defecto `post-media/`), y las **URLs públicas** de esos archivos se **concatenan** a lo que haya en `media` (si pones en `media` más URLs, van primero; luego van las de la subida).
- Misma S3: `S3_BUCKET`, política pública al prefijo de posts (`.../post-media/*` o el de `S3_POSTS_FOLDER`). ACL en la subida es opcional (`S3_OBJECT_PUBLIC_ACL=public-read` si el bucket lo permite); si no, solo política.

**Ejemplo JSON**
```json
{
  "title": "Mi post",
  "description": "Opcional",
  "media": ["https://.../ya-subida.png"],
  "website": "https://nuvix.dev",
  "tags": ["nestjs", "backend"],
  "isDraft": false
}
```

---

### `GET /posts`

**Que hace**
- Devuelve posts publicados en **`{ "data": [...], "limit", "offset", "filter" }`**. Cada ítem en `data` incluye `id`, `author` (resumen), `title`, `description`, `media`, `tags`, `likesCount`, `bookmarksCount`, `commentsCount`, `createdAt`, `updatedAt`, etc. (misma forma que un elemento alimentado por el socket `post:created`).
- **Orden:** más reciente primero (`createdAt` desc, desempate `id` desc). Paginación **offset** con `limit` y `offset`. Si `data.length < limit`, no hay más resultados; el front puede dejar de pedir.
- **Paginación — comportamiento bajo carga:** con offset clásico, si entran posts nuevos mientras paginas, puedes ver **repetidos** o **saltos** entre ventanas. Mitigación típica: **deduplicar por `id`** (p. ej. al fusionar con `post:created`). Para listas muy dinámicas, un **cursor** sería otra vía (no implementado aquí).
- **Query `filter`:** default `all`.
  - **`filter=all`:** todo el feed. No requiere autenticación.
  - **`filter=following`:** solo autores a los que sigues. Requiere **`Authorization: Bearer`**; sin token o token inválido → **401**. Si no sigues a nadie, `data: []`.
- **Query `limit`:** entero, default **20**, máximo **100**.
- **Query `offset`:** entero, default **0** (0, 20, 40… con `limit=20`).

**Ejemplos**
- `GET /posts?filter=all&limit=20&offset=0`
- `GET /posts?filter=following&limit=20&offset=0` (con Bearer)

**Respuesta ejemplo**
```json
{
  "data": [
    {
      "id": "clh...",
      "title": "…",
      "author": { "id": "clu…", "username": "dev", "photoKey": "https://…" },
      "likesCount": 0,
      "bookmarksCount": 0,
      "commentsCount": 0,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T10:00:00.000Z"
    }
  ],
  "limit": 20,
  "offset": 0,
  "filter": "all"
}
```

---

### `GET /posts/:id`

**Que hace**
- Devuelve detalle de un post por ID.
- Incluye autor, `likesCount`, `bookmarksCount` y `commentsCount` (totales de **ese** post).
- Para listar **quiénes** dieron like, usa `GET /posts/:postId/likes`.

---

### `DELETE /posts/:postId` (Bearer token requerido)

**Que hace**
- Elimina el post. **Solo** el usuario creador (`authorId` coincidente con el token) puede borrarlo.
- Si el post no existe → `404`. Si existes pero no eres el autor → `403 Forbidden`.
- Los likes y bookmarks de ese post se eliminan en cascada (Prisma).

**Respuesta ejemplo**
```json
{ "deleted": true, "id": "clh..." }
```

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

### `GET /posts/:postId/comments` (público)

**Que hace**
- Lista comentarios del post (solo publicados; borrador → `404`). Orden: más antiguos primero.
- Por defecto devuelve **5** comentarios; el resto con paginación: `?limit=5&offset=5`, `?offset=10`, etc. (`limit` 1–200).

**Respuesta ejemplo**
```json
{
  "postId": "clh...",
  "total": 2,
  "limit": 5,
  "offset": 0,
  "items": [
    {
      "id": "cmm...",
      "body": "Gran post",
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T10:00:00.000Z",
      "author": { "id": "clu...", "username": "dev", "photoKey": "https://..." }
    }
  ]
}
```

---

### `POST /posts/:postId/comments` (Bearer token requerido)

**Que hace**
- Crea un comentario. Cuerpo JSON: `{ "body": "..." }` (1–5000 caracteres).

---

### `PATCH /posts/:postId/comments/:commentId` (Bearer token requerido)

**Que hace**
- Edita el texto del comentario. Mismo cuerpo que al crear: `{ "body": "..." }`. Solo el **autor** del comentario.

---

### `DELETE /posts/:postId/comments/:commentId` (Bearer token requerido)

**Que hace**
- Borra el comentario. Solo el **autor** del comentario.

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
- Cada item incluye **`isFollowedByViewer`** (`true` | `false`). Sin `Authorization: Bearer` va todo en `false`. Con JWT válido indica si el usuario autenticado sigue a ese builder (para persistir “Siguiendo” tras F5).

**Query params opcionales**
- `by`: `combined | followers | likes` (default: `combined`)
- `limit`: `1..100` (default: `10`)

**Ejemplo**
- `GET /users/trending-builders?by=combined&limit=10` (opcional: header `Authorization: Bearer <token>`)

---

### `GET /users/my-profile` (Bearer token requerido)

**Que hace**
- Devuelve el perfil del usuario autenticado.
- Incluye conteos de followers/following/posts.
- Incluye bookmarks (ultimos 25) con sus posts.

### `GET /users/me/follow-counts` (Bearer token requerido)

**Que hace**
- Devuelve solo los numeros: `followersCount` (cuantos te siguen) y `followingCount` (a cuantos sigues). Mas ligero que el perfil completo si solo necesitas esos conteos en la UI.

### `POST` / `DELETE /users/:username/follow` (Bearer token requerido)

**Que hace**
- `POST` crea la relacion de seguimiento (si ya existia, no falla: idempotente). No puedes seguirte a ti mismo. El `username` es el de la persona a seguir o dejar de seguir; debe ser un usuario existente y activo.
- `DELETE` quita el seguimiento (si no existia, tampoco falla: idempotente).
- La respuesta incluye `following: true | false` y el `username` del objetivo.

### Lectura pública en S3 (fotos de perfil y de posts)

Si una URL (`photoKey`, o una imagen de post en el array `media`) devuelve **403 Access Denied**, falta `GetObject` público en la **política del bucket** para ese **prefijo**, o *Block public access* lo impide.

1. **Sin ACL en el objeto** (lo habitual hoy). Lectura pública = **política de bucket** por prefijos. Opt-in a ACL: `S3_OBJECT_PUBLIC_ACL=public-read` (solo si el bucket acepta ACLs).
2. **Prefijos (alinear con el `.env`)**
   - Perfil: `S3_USERS_FOLDER` o, por defecto, `profile-media/` (si usas p. ej. `users-profile`, en la política usa `users-profile/*`).
   - Imágenes de post: `S3_POSTS_FOLDER` o, por defecto, `post-media/`.

3. **Política** con **dos** rutas (perfil y posts) usando los nombres por defecto. Sustituye `TU_BUCKET` y, si hace falta, cambia `profile-media` y `post-media` por tus carpetas.

**Cómo aplicarla (consola AWS)**

1. [S3](https://s3.console.aws.amazon.com/s3/buckets) → abre el bucket.
2. **Permissions** → **Block public access** (ajusta si hace falta que las políticas del bucket permitan acceso de lectura al prefijo).
3. **Bucket policy** → **Edit** y pega un JSON del estilo del siguiente. **Save changes**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadProfileAndPostMedia",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": [
        "arn:aws:s3:::TU_BUCKET/profile-media/*",
        "arn:aws:s3:::TU_BUCKET/post-media/*"
      ]
    }
  ]
}
```

4. Comprueba en el navegador una URL bajo `profile-media/...` y otra bajo `post-media/...`.

**Con AWS CLI**

```bash
aws s3api put-bucket-policy --bucket TU_BUCKET --policy file://policy.json
```

5. **Objetos antiguos**: la política aplica a lo ya subido bajo esos prefijos, sin re-subir (salvo 403 por BPA o ARN distinto al prefijo real).

Puedes añadir más entradas en `Resource` (p. ej. `users-profile/*`) o más `Statement` si prefieres separar permisos.

---

### `GET /users/:username`

**Que hace**
- Devuelve el perfil publico de un usuario por `username`.
- Incluye conteos de followers/following/posts.

## Health / Base

### `GET /`

**Que hace**
- Endpoint base de prueba, responde `Hello World!`.

