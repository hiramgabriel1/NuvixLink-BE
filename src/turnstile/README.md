# Cloudflare Turnstile Verification Module

## Overview

Este módulo implementa la verificación de Cloudflare Turnstile en el backend Nuvix. Recibe tokens de CAPTCHA del frontend y los valida contra los servidores de Cloudflare usando una clave secreta del servidor.

## Architecture

El módulo consta de tres componentes principales:

- **TurnstileService**: Lógica de verificación y comunicación con Cloudflare
- **TurnstileController**: Endpoint HTTP para recibir tokens
- **VerifyTurnstileDto**: Validación de entrada con class-validator

## HTTP Endpoint

### POST `/turnstile/verify`

Verifica un token de Turnstile generado en el cliente.

**Request Body:**

```json
{
  "token": "0.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Response (200):**
Respuesta exacta de Cloudflare (no modificada):

```json
{
  "success": true,
  "challenge_ts": "2026-05-07T00:00:00.000Z",
  "hostname": "example.com",
  ...
}
```

**Error Responses:**

- **400 Bad Request**: Token faltante o inválido

  ```json
  {
    "error": "missing-token"
  }
  ```

- **502 Bad Gateway**: Fallo en upstream (Cloudflare)

  ```json
  {
    "error": "turnstile-upstream",
    "details": { "message": "..." }
  }
  ```

- **500 Internal Server Error**: Error de configuración
  ```json
  {
    "error": "internal"
  }
  ```

## Configuration

### Environment Variables

```env
# Required: Cloudflare Turnstile secret key
NUVIX_TURNSTILE_SECRET=<your_secret_here>
```

Obtén la clave en [Cloudflare Dashboard](https://dash.cloudflare.com/?to=/:account/turnstile).

## Implementation Details

### Security

- **Secret Management**: La clave secreta se lee de `process.env.NUVIX_TURNSTILE_SECRET` y NUNCA se expone en logs o responses
- **Token Validation**: Se valida con `class-validator` antes de procesar
- **Payload Verification**: Cloudflare response siempre debe contener `success: boolean`
- **Network Isolation**: Endpoint interno (se espera ejecutarse en red privada)

### Reliability

- **Timeouts**: 3 segundos por defecto (`REQUEST_TIMEOUT_MS`)
- **Retries**: Hasta 2 intentos (`MAX_ATTEMPTS`)
- **Error Handling**: Errores upstream capturados y transformados a respuestas estándar
- **Logging**: Solo se loguean errores no sensibles (nunca secret ni tokens)

### Cloudflare API Call

```
POST https://challenges.cloudflare.com/turnstile/v0/siteverify
Content-Type: application/x-www-form-urlencoded

secret={secret}&response={token}&remoteip={optional_ip}
```

## Testing

Ejecuta las pruebas unitarias:

```bash
npm test -- src/turnstile
```

Tests incluyen:

- Verificación exitosa con payload de Cloudflare
- Fallos upstream (con reintentos)
- Errores de configuración
- Validación de entrada
- Propagación de errores desde el service

## Integration with BFF

El BFF debe proxy esta ruta:

```
Frontend POST /api/nuvix/turnstile/verify (al BFF)
BFF proxy a Backend POST /turnstile/verify
BFF devuelve response exacta al frontend
```

El frontend recibe:

```json
{
  "success": boolean,
  ...
}
```

## Example Usage (cURL)

```bash
curl -X POST http://localhost:5001/turnstile/verify \
  -H "Content-Type: application/json" \
  -d '{"token":"0.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}'
```

## Error Flow

```
Request → DTO Validation
          ├─ Fail → 400 (missing-token)
          └─ OK → Service.verifyToken()
                  ├─ No secret → 500 (internal)
                  └─ Secret OK → Call Cloudflare
                                 ├─ Fail (all retries) → 502 (turnstile-upstream)
                                 └─ Success → 200 + Cloudflare payload
```
