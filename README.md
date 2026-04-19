# Arunika Finance

Arunika Finance is a lightweight personal finance web application for tracking transactions, reviewing cashflow, capturing receipts, and chatting with a finance assistant backed by your latest account data.

## Highlights

- Personal dashboard for balance, income, expenses, savings rate, and automated insights.
- Account-based authentication with isolated user data via secure session cookies.
- SQLite-backed storage for local-first deployment simplicity.
- Transaction table with search, filtering, editing, and deletion.
- Receipt capture and OCR-assisted transaction drafting.
- Telegram bot integration for finance chat and transaction workflows.
- Dual assistant modes:
  - Local mode without external AI configuration.
  - OpenAI-assisted mode when `OPENAI_API_KEY` is configured.

## Tech Stack

- Node.js 22
- Native HTTP server
- SQLite via Node.js built-in runtime support
- Vanilla JavaScript frontend
- Tailwind CSS component layer plus custom CSS
- GitHub Actions for verification
- Render blueprint for deployment

## Requirements

- Node.js `>= 22.18.0`
- npm
- Optional: OpenAI API key
- Optional: Telegram bot credentials

## Quick Start

1. Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

2. Install dependencies:

```powershell
npm install
```

3. Start the application:

```powershell
npm start
```

4. Open:

```text
http://localhost:3000
```

## Available Scripts

- `npm run dev`
  - Starts the app locally.
- `npm run sync:public`
  - Rebuilds frontend assets from `src/client/` into root assets and `public/`.
- `npm run preflight`
  - Validates core deployment environment values.
- `npm run test:light`
  - Runs lightweight module tests.
- `npm run test:routes`
  - Runs smoke tests for critical HTTP routes.
- `npm run test:telegram`
  - Runs Telegram OCR and assistant flow checks.
- `npm run verify`
  - Runs sync, tests, and syntax validation as a broader verification suite.

## Environment Variables

Use `.env.example` as the canonical starting point.

### Core

- `PORT`
- `NODE_ENV`
- `APP_BASE_URL`
- `ALLOWED_ORIGINS`

### AI and OCR

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `OCR_SPACE_API_KEY`

### Session and HTTP controls

- `SESSION_COOKIE_SAME_SITE`
- `BODY_LIMIT_BYTES`
- `STATIC_CACHE_MAX_AGE_SECONDS`
- `SLOW_REQUEST_THRESHOLD_MS`

### Telegram

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_AUTO_SET_WEBHOOK`
- `TELEGRAM_RECEIPT_DRAFT_TTL_MS`

### Rate limiting

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

### Data isolation for tests or local experimentation

- `ARUNIKA_DATA_DIR`
- `ARUNIKA_DB_FILE`

## Project Structure

```text
src/
  client/
    index.html
    styles.css
    styles.tailwind.css
    app/
      core/
      render/
      transactions/
      actions/
      bootstrap.js
  server/
    app.js
    index.js
    auth/
    data/
    routes/
    services/
scripts/
public/
```

### Notes

- `src/client/` is the frontend source of truth.
- `src/server/` is the backend source of truth.
- Root assets such as `index.html`, `styles.css`, and `app.js` are generated/synced outputs.
- `src/client/styles.tailwind.css` provides the framework utility layer, while `src/client/styles.css` contains the main custom styling system.

## Quality and Verification

### Lightweight module tests

```powershell
npm run test:light
```

Current coverage includes:

- flexible amount parsing
- receipt OCR/parser helpers
- transaction utility behavior

### Route smoke tests

```powershell
npm run test:routes
```

Current coverage includes:

- `GET /api/health`
- registration and session auth
- transaction endpoint protection
- transaction creation and summary calculation

### Telegram flow checks

```powershell
npm run test:telegram
```

Current coverage includes:

- Telegram receipt upload to OCR draft
- quick draft editing commands
- draft reset and view operations
- quick action callbacks
- low-confidence validation checks
- save and cancel flows

### Full verification

```powershell
npm run verify
```

This command rebuilds public assets, runs test suites, and checks JavaScript syntax for key files.

## Security and Reliability

The application includes:

- HTTP security headers
- origin validation for unsafe API mutations
- configurable API rate limiting
- request body size limits
- secure session cookies in production
- health and readiness reporting through `/api/health`

## Deployment

### Render

This repository includes a production-ready [render.yaml](render.yaml) blueprint.

1. Push the repository to GitHub.
2. In Render, create a new Blueprint service from the repository.
3. Confirm the `arunika-finance` service is created.
4. Configure the required environment variables:
   - `APP_BASE_URL`
   - `TELEGRAM_BOT_TOKEN`
5. Optionally configure:
   - `TELEGRAM_BOT_USERNAME`
   - `OPENAI_API_KEY`
   - `ALLOWED_ORIGINS`
6. Deploy the service.
7. Verify:

```text
GET /api/health
```

Recommended before deploy:

```powershell
npm run preflight
npm run verify
```

### Deployment notes

- SQLite data is expected on a persistent disk under `data/`.
- Telegram webhook setup can be automated at startup when:
  - `TELEGRAM_AUTO_SET_WEBHOOK=true`
  - `APP_BASE_URL` is valid
  - `TELEGRAM_BOT_TOKEN` is configured

## Progressive Web App

Once deployed on HTTPS, the app can be installed on mobile devices.

- Android / Chrome: use `Install app` or `Add to Home screen`
- iPhone / Safari: use `Share` -> `Add to Home Screen`

## Telegram Linking

1. Sign in to the web dashboard.
2. Open the Telegram panel.
3. Generate a linking code.
4. Send the code to the Telegram bot.
5. Once linked, you can use:
   - `/summary`
   - `/help`
   - free-form finance questions
   - transaction input messages such as `pengeluaran 25000 makan siang kategori Makanan`

## Demo Account

- Email: `demo@arunika.local`
- Password: `demo12345`

## References

- https://platform.openai.com/docs/api-reference/responses
- https://platform.openai.com/docs/models/gpt-4.1-mini

## Technical Notes

- The frontend uses a gradual Tailwind CSS integration through the `sync-public` pipeline.
- The backend uses Node.js built-in SQLite runtime support available in Node 22.
