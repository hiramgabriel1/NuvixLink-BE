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
- `GET /posts/bookmarks/me`
- `POST /posts/:postId/bookmark`
- `DELETE /posts/:postId/bookmark`
- `GET /users/my-profile`
- `GET /users/me` (alias)
- `POST /auth/logout`
- `POST /reports`

## Reports

### `POST /reports` (Bearer token requerido)

**Que hace**
- Guarda un reporte asociado al usuario autenticado (quien reporta se guarda en `reporterId` en base de datos).

**Que pide (body JSON)**
- `typeReport` (obligatorio): string, max 50 (ej. categoría: `spam`, `harassment`, etc.)
- `title` (obligatorio): string, max 150
- `description` (opcional): string, max 3000
- `image` (opcional): string, max 512 (URL pública o clave S3 / ruta de evidencia)
- `url` (opcional): URL valida (ej. enlace a perfil o contenido reportado)
- `emailToContact` (opcional): email (ej. contacto de moderación si el flujo lo pide en el formulario)

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

**Respuesta (HTTP 201)**
- Devuelve el registro creado, incluyendo el `id` generado y `reporterId` (ID del usuario del token), mas los campos guardados y `createdAt` (ISO 8601).

```json
{
  "id": "clx...",
  "reporterId": "clx...",
  "typeReport": "harassment",
  "title": "Comportamiento inapropiado en DM",
  "description": "Descripcion de lo ocurrido",
  "image": "photos/user/evidencia.png",
  "url": "https://nuvix.dev/users/usuario",
  "emailToContact": "mod@nuvix.dev",
  "createdAt": "2026-04-24T12:00:00.000Z"
}
```

- Sin `Authorization: Bearer` o token invalido: `401 Unauthorized`.

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

---

### `GET /posts/:id`

**Que hace**
- Devuelve detalle de un post por ID.
- Incluye autor y conteos de likes/bookmarks.

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

---

### `GET /users/:username`

**Que hace**
- Devuelve el perfil publico de un usuario por `username`.
- Incluye conteos de followers/following/posts.

## Health / Base

### `GET /`

**Que hace**
- Endpoint base de prueba, responde `Hello World!`.

