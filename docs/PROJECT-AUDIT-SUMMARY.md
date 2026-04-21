# Project Audit Summary

## Scope

This audit reviews the current application architecture, security posture, reliability, maintainability, user experience, and deployment readiness based on the repository state after the local-only finance assistant update.

## Executive Summary

Arunika Finance is already in a stronger position than a typical early-stage internal tool. The project has a clear full-stack structure, secure-by-default HTTP headers, session-based authentication, rate limiting, verification scripts, deployment guidance, and a local-only finance assistant that reduces privacy risk for chat interactions.

The main remaining gaps are not foundational failures. They are mostly production-hardening and scale-readiness issues:

- SQLite and in-process state keep operations simple, but create operational risk around backups, scaling, and multi-instance behavior.
- The server entry point still concentrates too much responsibility in a single file, which increases change risk.
- Test coverage is meaningful, but it still leaves several high-value paths without explicit regression protection.
- The bilingual UX foundation is good, but not yet fully standardized across all dynamic and domain-specific text.
- Optional external receipt-analysis integrations introduce privacy and availability considerations that should be governed clearly in production.

## Current Architecture Snapshot

### Backend

- Main server entry point: `src/server/app.js`
- HTTP security, CORS, body parsing, and rate limiting: `src/server/http.js`
- Session cookie handling: `src/server/auth/session.js`
- Auth routes: `src/server/routes/auth.js`
- Transaction and export routes: `src/server/routes/transactions.js`
- SQLite data access and session storage: `src/server/data/database.js`
- Telegram workflows: `src/server/services/telegram/service.js` and `src/server/routes/telegram.js`
- System health/readiness endpoint: `src/server/routes/system.js`

### Frontend

- Main document: `src/client/index.html`
- Runtime state and i18n foundation: `src/client/app/core/runtime.js`
- App bootstrap: `src/client/app/bootstrap.js`
- Main dashboard rendering: `src/client/app/render/dashboard.js`

### Delivery and verification

- Verification entry point: `npm run verify`
- Frontend asset sync pipeline: `scripts/sync-public.js`
- Deployment guidance: `docs/DEPLOYMENT-CHECKLIST.md`
- Repository onboarding and env guidance: `README.md`

## What Is Working Well

- Strong baseline HTTP headers are applied centrally.
- Unsafe API mutations are origin-checked.
- Session cookies are `HttpOnly`, `SameSite`, and `Secure` in production.
- Route-level and bucketed rate limiting are already present.
- User data is isolated by session and user ID.
- Finance chat is now local-only, reducing external AI exposure for chat queries.
- Transaction export now supports server-side CSV and PDF downloads.
- The deployment checklist and README are materially better than before.
- Verification already covers modules, route smoke checks, Telegram flows, asset sync, and syntax validation.

## Priority Findings

### High Priority

#### 1. Operational risk from SQLite plus local disk dependency

**Why it matters**

The application depends on SQLite and local/persistent disk state. This is fine for single-instance deployment, but it creates backup, restore, scaling, and failover risk if operations are not disciplined.

**Evidence**

- SQLite is the primary database in `src/server/data/database.js`
- Deployment notes explicitly depend on persistent disk under `data/`
- Sessions are stored in the same database layer

**Impact**

- Higher risk of downtime or data loss if persistent storage is misconfigured
- Difficult horizontal scaling without changing data/session strategy
- Recovery quality depends on operator procedure, not only code

**Recommendation**

- Define and test backup and restore procedures for the SQLite database
- Document recovery time objective and recovery point objective
- Treat single-instance deployment as an explicit architecture constraint
- Add an operational workflow for pre-deploy backup and rollback verification

**Suggested effort**

- Medium

#### 2. Rate limiting is in-memory and therefore instance-local

**Why it matters**

Rate limiting currently uses an in-process `Map`, which is simple and fast, but it resets on restart and does not coordinate across multiple instances.

**Evidence**

- `RATE_LIMIT_STORE = new Map()` in `src/server/app.js`
- `createHttpService()` consumes that in-memory store in `src/server/http.js`

**Impact**

- Rate limiting can be bypassed across replicas if the app is scaled out
- Limits are lost after restart
- Behavior may be inconsistent under autoscaling or blue-green deployment

**Recommendation**

- Keep current design for single-instance mode
- If multi-instance deployment is planned, move rate-limit state to a shared backend such as Redis or equivalent managed storage
- Document current single-instance assumption in production guidance

**Suggested effort**

- Medium

#### 3. `src/server/app.js` remains a maintainability hotspot

**Why it matters**

The server entry point still coordinates env loading, service wiring, routing, receipt analysis integration, Telegram behavior, request handling, and finance assistant logic. That concentration increases regression risk and makes future onboarding slower.

**Evidence**

- `src/server/app.js` remains the central composition and behavior file
- Multiple domains are initialized and orchestrated there

**Impact**

- Higher chance of side effects during future changes
- Harder unit testing and ownership boundaries
- More difficult review for security-sensitive changes

**Recommendation**

- Extract orchestration into smaller modules by concern:
  - chat assistant service
  - system/health composition
  - env/config loading
  - request/router composition
  - receipt-analysis provider adapter
- Keep `app.js` as a thin composition root

**Suggested effort**

- Medium

### Medium Priority

#### 4. Test coverage does not yet explicitly protect some high-value flows

**Why it matters**

The project already has meaningful verification, but not all recently critical behaviors are obviously covered by dedicated regression tests.

**Evidence**

Documented coverage in `README.md` includes:

- module tests
- route smoke tests
- Telegram flow checks
- verify pipeline

However, explicit coverage is not called out for:

- transaction export filtering and download behavior
- local-only chat mode behavior in `/api/health`
- end-to-end i18n switching across dashboard surfaces
- receipt-analysis failure modes under provider unavailability

**Impact**

- Important user-facing regressions could pass unnoticed during refactors
- Production confidence still depends partly on manual smoke tests

**Recommendation**

Add targeted regression tests for:

- `GET /api/transactions/export` with filter permutations
- `/api/health` asserting `chatMode=local`
- local assistant reply behavior for chat and Telegram summary flows
- receipt-analysis error handling and low-confidence review paths

**Suggested effort**

- Small to Medium

#### 5. Optional external receipt-analysis integrations need explicit governance

**Why it matters**

Chat is now local-only, but receipt analysis may still rely on external providers depending on environment configuration. That is acceptable, but it must be governed as a separate privacy and reliability decision.

**Evidence**

- `OPENAI_*` and `OCR_SPACE_API_KEY` remain in env guidance for receipt analysis
- Receipt analysis routes exist in `src/server/routes/transactions.js`

**Impact**

- Production operators may incorrectly assume the whole product is external-free
- Receipt uploads may be subject to external provider risk or policy requirements

**Recommendation**

- Keep chat and receipt analysis clearly separated in docs and deployment policy
- Add a product-level privacy note explaining when uploaded receipt content may leave the app boundary
- Consider a config flag to disable all external receipt-analysis integrations in privacy-sensitive deployments

**Suggested effort**

- Small

#### 6. Session lifecycle management is simple but minimally automated

**Why it matters**

Expired sessions are invalidated when looked up, but there is no dedicated cleanup mechanism described for stale session accumulation.

**Evidence**

- `getSessionWithUser()` deletes expired sessions on access in `src/server/data/database.js`

**Impact**

- Session rows may accumulate over time unless natural access patterns clean them up
- Operational hygiene depends on incidental usage

**Recommendation**

- Add a lightweight periodic cleanup task or maintenance command for expired sessions
- Document database hygiene expectations for long-running deployments

**Suggested effort**

- Small

### Low Priority

#### 7. i18n foundation is strong, but full global UX consistency is not complete

**Why it matters**

The app already has locale state, persistence, translation attributes, and localized dashboard rendering. That is a strong foundation. But some domain data and copy conventions still appear partially localized rather than fully internationalized.

**Evidence**

- `LOCALE_STORAGE_KEY`, `SUPPORTED_LOCALES`, and translation helpers exist in `src/client/app/core/runtime.js`
- Key surfaces in `src/client/index.html` and `src/client/app/render/dashboard.js` are locale-aware
- Domain category values remain tied to Indonesian labels in runtime defaults

**Impact**

- English mode may still feel partially translated rather than globally polished
- Long-term localization expansion will be harder if domain labels remain embedded in one language

**Recommendation**

- Separate canonical category identifiers from display labels
- Continue migrating remaining dynamic text and status messaging into the translation layer
- Add UX smoke tests for both supported locales

**Suggested effort**

- Medium

#### 8. CSP is good, but style policy is still permissive

**Why it matters**

The content security policy is already better than average, but it still allows `'unsafe-inline'` for styles.

**Evidence**

- `style-src 'self' 'unsafe-inline'` in `src/server/http.js`

**Impact**

- Slightly weaker defense-in-depth posture than a stricter CSP

**Recommendation**

- Keep current policy if required by the current frontend pipeline
- Longer term, reduce inline style dependence and move toward a stricter style CSP

**Suggested effort**

- Medium

## Overall Risk View

### Security

**Status:** Good baseline, moderate hardening opportunities remain.

The project has solid core controls for a custom Node HTTP app: security headers, origin checks, secure cookies in production, and rate limiting. The remaining work is mostly governance and hardening, not emergency remediation.

### Reliability

**Status:** Good for single-instance deployment, moderate operational risk for scale and recovery.

The application appears reliable for a modest single-node deployment, but resilience still depends on storage setup, backup discipline, and provider behavior for optional receipt analysis.

### Maintainability

**Status:** Improving, but the server composition root is still too large.

The codebase has become more structured, but future complexity will become more expensive unless `src/server/app.js` is reduced further.

### UX and product readiness

**Status:** Strong progress, not yet fully standardized.

The UI now has bilingual foundations, export capabilities, and a more production-ready feel. The remaining gap is consistency across all copy, domain labels, and edge-case flows.

## Recommended Next Actions

### Next 7 days

- Create and test a documented SQLite backup and restore procedure
- Add tests for `chatMode=local` and transaction export paths
- Add a short privacy note for optional external receipt-analysis providers

### Next 30 days

- Refactor `src/server/app.js` into smaller composition and service modules
- Add a cleanup strategy for expired sessions
- Expand locale coverage and separate category identifiers from display labels

### Before any multi-instance deployment

- Replace in-memory rate limiting with shared state
- Revisit SQLite/session strategy for scale
- Reassess deployment topology and recovery guarantees

## Final Assessment

The project is no longer in a fragile prototype state. It is a credible production-oriented application for small-scale deployment, with especially strong progress in security posture, verification discipline, deployment guidance, and privacy posture for finance chat.

The best next investments are not flashy feature work. They are operational maturity, sharper regression coverage, and continued modularization.
