# Deployment Checklist

This checklist is intended for production deployment handoff, operational review, and safer releases.

## 1. Source Control and Release Readiness

- Confirm the target branch is up to date.
- Confirm GitHub Actions verification passes.
- Review recent changes in `CHANGELOG.md`.
- Confirm no secrets are committed to the repository.

## 2. Environment Configuration

Required baseline values:

- `NODE_ENV=production`
- `APP_BASE_URL`
- `PORT`
- `SESSION_COOKIE_SAME_SITE`
- `BODY_LIMIT_BYTES`
- `STATIC_CACHE_MAX_AGE_SECONDS`
- `SLOW_REQUEST_THRESHOLD_MS`

Optional integrations:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `OCR_SPACE_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_AUTO_SET_WEBHOOK`
- `TELEGRAM_RECEIPT_DRAFT_TTL_MS`

Rate limit review:

- `RATE_LIMIT_API_MAX`
- `RATE_LIMIT_API_WINDOW_MS`
- `RATE_LIMIT_AUTH_MAX`
- `RATE_LIMIT_AUTH_WINDOW_MS`
- `RATE_LIMIT_CHAT_MAX`
- `RATE_LIMIT_CHAT_WINDOW_MS`
- `RATE_LIMIT_TELEGRAM_WEBHOOK_MAX`
- `RATE_LIMIT_TELEGRAM_WEBHOOK_WINDOW_MS`
- `RATE_LIMIT_TRANSACTION_WRITE_MAX`
- `RATE_LIMIT_TRANSACTION_WRITE_WINDOW_MS`

## 3. Infrastructure and Storage

- Confirm persistent storage is mounted for SQLite data.
- Confirm the runtime uses Node.js `>= 22.18.0`.
- Confirm HTTPS termination is enabled at the hosting layer.
- Confirm reverse proxy forwards protocol headers correctly.

## 4. Security Checks

- Confirm `APP_BASE_URL` is a public HTTPS URL.
- Confirm session cookies are marked `Secure` in production.
- Confirm allowed origins are limited to trusted domains.
- Confirm Telegram secrets and API keys are stored in platform secrets, not source code.
- Confirm HSTS is being returned when the app is served behind HTTPS.

## 5. Build and Verification

Run before each deployment:

```powershell
npm run preflight
npm run sync:public
npm run verify
```

Recommended manual checks:

- Open `/api/health` and confirm status is `ok`.
- Confirm the app loads without console-breaking errors.
- Confirm login, register, logout, and session restoration work.
- Confirm transaction create/edit/delete flows work.
- Confirm import preview still works.
- Confirm Telegram status surface renders correctly.

## 6. Observability and Operations

- Confirm application logs are available from the hosting platform.
- Confirm slow request logging is enabled with an appropriate threshold.
- Confirm request IDs are visible in API responses and logs where expected.
- Confirm on-call or maintainer contact is known before release.

## 7. Telegram-Specific Release Checks

- Confirm `TELEGRAM_BOT_TOKEN` is valid.
- Confirm `APP_BASE_URL` is publicly reachable.
- Confirm webhook auto-registration behavior is intentional.
- Confirm link-code generation and unlink flow work from the dashboard.

## 8. Rollback Readiness

- Record the previous production commit hash.
- Confirm the previous deploy can be restored quickly.
- Confirm database backup or storage recovery procedure is known.
- Confirm any environment variable changes are documented.

## 9. Post-Deploy Smoke Test

- Load the home page.
- Sign in with a non-production or demo-safe account.
- Create and remove a sample transaction.
- Verify summary cards and charts update.
- Check `/api/health` once more.
- Confirm logs show no unexpected server errors.
