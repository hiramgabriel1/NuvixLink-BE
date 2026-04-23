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

Los endpoints protegidos aceptan **dos esquemas de Bearer token**:

1. **JWT propio** (emitido por `POST /auth/login` o `POST /auth/verify-email`).
2. **JWT de Clerk** (emitido por el frontend de Next.js tras `Authorization: Bearer <clerk_jwt>`).

El guard intenta primero validar el token con Clerk (JWKS remoto) si `CLERK_ISSUER` está configurado, y cae al JWT local si ese token no coincide con el formato/issuer de Clerk. Si ninguno valida → `401 Unauthorized`.

### Clerk (JWKS)

Variables de entorno:

```
CLERK_ISSUER=https://<tu-clerk-frontend-api>.clerk.accounts
CLERK_AUDIENCE=   # opcional según tu configuración de Clerk
```

- La validación se hace con JWKS remoto (`<issuer>/.well-known/jwks.json`) usando `jose`, con caching automático.
- Se valida `issuer` y, si se configura, `audience`.
- Claims usados para mapear el usuario:
  - `sub` → `clerkUserId` (obligatorio).
  - `email` (o `email_address` / `primary_email_address`) → email.
  - `username` (o `user_name` / `given_name`) → username.
- Mapeo a BD (`findOrCreateByClerk`, idempotente):
  1. Si existe un `User` con ese `clerkUserId`, se usa.
  2. Si no, y el email coincide con un usuario existente, se enlaza `clerkUserId` al usuario (y se marca `isVerified=true`).
  3. Si no, se crea un `User` nuevo con email/username derivados de los claims (con fallbacks seguros si vienen vacíos).

Ejemplo de llamada con token de Clerk:

```bash
curl -H "Authorization: Bearer <clerk_jwt>" http://localhost:4000/users/my-profile
```

Endpoints protegidos hoy:
- `POST /posts`
- `GET /posts/bookmarks/me`
- `POST /posts/:postId/bookmark`
- `DELETE /posts/:postId/bookmark`
- `GET /users/my-profile`
- `GET /users/me` (alias)
- `POST /auth/logout`

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

