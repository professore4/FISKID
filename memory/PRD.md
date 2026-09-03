# FiskID — MVP + Iteration 2 PRD

## Vision
FiskID is a **Digital Fiscal Identity Card**. A person, professional, or company saves their tax data once and shares it privately with an operator (merchant / professional / office) that must issue an electronic invoice. Value promise: **"Mai più comunicare a voce i tuoi dati fiscali."**

## MVP Scope (iter 1 — shipped)
1. Email/password auth (register, login, logout, forgot/reset password) — JWT + bcrypt.
2. Fiscal profile: type (individual / professional / company), name/surname/business name, VAT, tax code, address, CAP, city, province, country, recipient code (SDI), PEC, contact email/phone. Format-only validation.
3. Premium Fiscal Identity Card (wallet-like) as the hero of the private dashboard.
4. Sharing via QR: backend generates a 32-byte URL-safe random token; app renders QR + copyable URL `/share/{token}`.
5. Operator side: opens `/share/{token}` on web or scans in-app → read-only fiscal data + tap-to-copy + "Copia tutti i dati" + "Conferma acquisizione dati".
6. Product event tracking to MongoDB.

## Iteration 2 additions (this iteration — shipped)
### Multi Identità
- One user can save many fiscal profiles (`Personale`, `Studio Rossi Srl`, …). Each profile has a `label`, `is_default` flag, and can be soft-deleted (`deleted_at`).
- New endpoints: `GET/POST/PUT/DELETE /api/fiscal-profiles`, `GET /api/fiscal-profiles/{id}`, `POST /api/fiscal-profiles/{id}/set-default`. Legacy singular `POST/GET /api/fiscal-profile` still works.
- Deleting a profile auto-revokes its active shares and auto-promotes another one as default.
- Dashboard shows a horizontal chip switcher — tap to switch, long-press to set as default. "+ Aggiungi" opens the edit form in create mode.
- Share screen accepts `?id=<profile_id>` and shows the identity label as a badge above the QR.

### Wallet Pass (preview MVP scaffold)
- `POST /api/fiscal-profiles/{id}/wallet-tokens` returns short-lived signed URLs for Apple + Google wallet endpoints.
- `GET /api/wallet/apple/{jwt}` returns a **structurally valid but unsigned** `.pkpass` ZIP (pass.json + manifest.json + empty signature + icon/logo PNGs). Real Apple Pass Type ID + `.p12` cert plug in later (env vars `APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`).
- `GET /api/wallet/google/{jwt}` redirects (302) to `https://pay.google.com/gp/v/save/{unsigned_jwt}`. Real GCP service account + Issuer ID plug in later.
- Card screen has "Aggiungi a Apple Wallet" + "Aggiungi a Google Wallet" buttons. Toasts explain that this is a preview scaffold until certs are provided.

## Stack
- **Backend**: FastAPI + Motor + MongoDB. All routes under `/api`. bcrypt (12 rounds, threadpool) + PyJWT (HS256, 30-day access token). Password reset via SHA-256 hashed one-time token (TTL 30 min).
- **Frontend**: Expo Router (React Native + Web). Dark obsidian + emerald "Glass/Luxe DARK" personality. `expo-image`, `expo-linear-gradient`, `expo-camera`, `react-native-qrcode-svg`, `expo-secure-store` (native) / `AsyncStorage` (web).
- **Data**: MongoDB collections `users`, `fiscal_profiles` (multi per user, soft delete via `deleted_at`), `shares`, `product_events`, `password_resets`. Unique indexes on `users.email` and `shares.share_token`; non-unique on `fiscal_profiles.user_id`.

## Routes
- `/` – auth-aware redirect (welcome vs dashboard)
- `/welcome`, `/register`, `/login`, `/forgot-password`
- `/onboarding` – 3-step value carousel
- `/dashboard` – identity switcher + hero card + action rows + share history
- `/card` — accepts `?id=<profile>`; shows detail + Apple/Google Wallet buttons + sticky "Condividi dati fiscali"
- `/fiscal-profile/edit` — accepts `?id=<profile>`; create if omitted, update if provided; supports delete when editing
- `/history` — full share history
- `/share` — accepts `?id=<profile>`; renders QR + copy link for that identity
- `/scanner` — operator in-app scanner (native only; web fallback)
- `/share/[token]` — **public** operator page (no auth). Works on iOS, Android, and Web.

## Out of scope
Invoice issuance, SDI integration, TeamSystem/Zucchetti integrations, payments, cashback, loyalty, AI, OCR, document management, chat, complex notifications, **real Apple/Google Wallet signing** (structure ready, credentials pending).

## Test coverage
- Iteration 1: 23/23 pytest backend tests passing (`/app/backend/tests/test_fiskid_api.py`).
- Iteration 2: 23 additional pytest tests passing (`/app/backend/tests/test_multi_identity_wallet.py`). Total: 46/46.
- Frontend end-to-end flows validated via Playwright on Expo Web preview.
