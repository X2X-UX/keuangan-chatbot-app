# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by Keep a Changelog and follows a practical, project-level release summary.

## [Unreleased]

### Added
- International-ready package metadata including repository, homepage, bug tracker, and Node engine requirements.
- Expanded `.env.example` covering deployment, security, rate limiting, OCR, Telegram, and test isolation settings.
- Cross-platform repository consistency via `.editorconfig` and `.gitattributes`.
- Richer web metadata including SEO, Open Graph, Twitter Card, and PWA-facing improvements.
- CI workflow improvements with npm cache, timeout protection, and safe deployment placeholders.
- Production-oriented documentation for environment setup, verification, and deployment.

### Changed
- README rewritten into a more professional English format for broader maintainability and onboarding.
- PWA manifest description updated for more global product positioning.
- Preflight output standardized to English for clearer CI and maintainer logs.
- UI surfaces modernized toward a premium SaaS dashboard style across auth, cards, chat, table, filters, and sidebar areas.
- Frontend auth UX refined with better validation, status messaging, and focus handling.
- Health/status surfaces made more informative for deployment readiness and operational clarity.

### Security
- Stronger security headers and safer origin validation for mutation routes.
- Configurable rate limiting, request body limits, cookie behavior, and static cache controls.
- Clearer deployment readiness checks for `APP_BASE_URL`, Telegram configuration, and session policy.

### Verification
- `npm run sync:public`
- `npm run test:light`
- `npm run test:routes`
- `npm run test:telegram`
- `npm run verify`
