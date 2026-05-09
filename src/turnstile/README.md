# Cloudflare Turnstile Verification Module

## Overview

This module implements Cloudflare Turnstile verification in the Nuvix backend. It receives CAPTCHA tokens from the frontend and validates them against Cloudflare servers using a server secret key.

## Architecture

The module consists of three main components:

- **TurnstileService**: Verification logic and communication with Cloudflare
- **TurnstileController**: HTTP endpoint to receive tokens
- **VerifyTurnstileDto**: Input validation using class-validator

## HTTP Endpoint

### POST `/turnstile/verify`

Verifies a Turnstile token generated on the client side.

**Request Body:**

```json
{
  "token": "0.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```
*Note: The token can also be provided as `captchaToken`.*

**Response (200):**
Exact response from Cloudflare (unmodified):

```json
{
  "success": true,
  "challenge_ts": "2026-05-07T00:00:00.000Z",
  "hostname": "example.com",
  ...
}
```

**Error Responses:**

- **400 Bad Request**: Missing or invalid token

  ```json
  {
    "error": "missing-token"
  }
  ```

- **502 Bad Gateway**: Upstream failure (Cloudflare)

  ```json
  {
    "error": "turnstile-upstream",
    "details": { "message": "..." }
  }
  ```

- **500 Internal Server Error**: Configuration error
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

Get the key from the [Cloudflare Dashboard](https://dash.cloudflare.com/?to=/:account/turnstile).

## Implementation Details

### Security

- **Secret Management**: The secret key is read from `process.env.NUVIX_TURNSTILE_SECRET` and is NEVER exposed in logs or responses.
- **Token Validation**: Validated using `class-validator` before processing.
- **Payload Verification**: The Cloudflare response must always contain `success: boolean`.
- **Network Isolation**: Internal endpoint (expected to run in a private network).

### Reliability

- **Timeouts**: 3 seconds by default (`REQUEST_TIMEOUT_MS`).
- **Retries**: Up to 2 attempts (`MAX_ATTEMPTS`).
- **Error Handling**: Upstream errors are caught and transformed into standard responses.
- **Logging**: Only non-sensitive errors are logged (secrets and tokens are never logged).

### Cloudflare API Call

```
POST https://challenges.cloudflare.com/turnstile/v0/siteverify
Content-Type: application/x-www-form-urlencoded

secret={secret}&response={token}&remoteip={optional_ip}
```

## Testing

Run unit tests:

```bash
npm test -- src/turnstile
```

Tests include:

- Successful verification with Cloudflare payload
- Upstream failures (with retries)
- Configuration errors
- Input validation (for both `token` and `captchaToken`)
- Error propagation from the service

## Integration with BFF

The BFF must proxy this route:

```
Frontend POST /api/nuvix/turnstile/verify (to BFF)
BFF proxies to Backend POST /turnstile/verify
BFF returns the exact response to the frontend
```

The frontend receives:

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
