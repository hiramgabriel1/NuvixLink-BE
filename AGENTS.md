# AGENTS.md — nuvix-backend

NestJS backend. Node >= 20.19.0. PostgreSQL + Prisma.

## Build & Dev

- `npm run build` runs `prisma generate && nest build` — **generation must precede build**
- `npm run start:dev` — watch mode
- `postinstall` auto-runs `prisma generate`

## Test

- Unit: `npm test` — runs `*.spec.ts` (jest config at `jest.config.ts`)
- E2E: `npm run test:e2e` — runs `*.e2e-spec.ts` (config at `test/jest-e2e.json`)
- No combined test command; run both separately

## Lint & Format

- `npm run lint` — eslint with `--max-warnings=0` (zero warnings enforced)
- `npm run format` — prettier: single quotes, trailing commas, semi, printWidth 100

## Architecture

Entry: `src/main.ts` | App module: `src/app.module.ts`

Modules: auth, posts, users, notifications, discussions, reports, challenges, search, realtime (Socket.IO), storage (S3), mail, prisma, common/errors

## Key Quirks

- **Socket.IO shares HTTP port** — no separate WebSocket port
- **S3 uploads**: profile images (`S3_USERS_FOLDER` / `profile-media/`), post media (`S3_POSTS_FOLDER` / `post-media/`), reports (`S3_REPORTS_PREFIX` / `reports/`). Public read via bucket policy, not object ACL (unless `S3_OBJECT_PUBLIC_ACL=public-read`)
- **Auth flow**: register → email verification → login. Unverified users cannot login. JWT required for protected routes.
- **Prisma**: client generated via `postinstall` and before build; migrations via `npm run prisma:migrate`
- **TS config**: commonjs, experimental decorators, `strict: true` but `noImplicitAny: false`
