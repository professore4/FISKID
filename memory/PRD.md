# FiskID — MVP PRD

## Vision
FiskID is a **Digital Fiscal Identity Card**. A person, professional, or company saves their tax data once and shares it privately with an operator (merchant / professional / office) that must issue an electronic invoice. The value promise: **"Mai più comunicare a voce i tuoi dati fiscali."**

## MVP Scope
1. Email/password auth (register, login, logout, forgot/reset password) — JWT + bcrypt.
2. Fiscal profile: type (individual / professional / company), name/surname/business name, VAT, tax code, address, CAP, city, province, country, recipient code (SDI), PEC, contact email/phone. Format-only validation (VAT 11 digits, CF 16 chars, CAP 5 digits, SDI 6–7 chars, PEC as email).
3. **Fiscal Identity Card**: premium wallet-like card (metal texture + gradient scrim + emerald accents) displayed as the hero of the private dashboard. Never shows raw VAT/CF/PEC on the card — only display name, entity type, and a masked VAT.
4. Sharing: user taps "Condividi dati fiscali" → backend generates a 32-byte URL-safe random token (contains no user data) → app renders QR + copyable URL `/share/{token}`.
5. Operator side: opens `/share/{token}` on web (or scans in-app via camera scanner) → sees a read-only fiscal-data page with tap-to-copy fields + "Copia tutti i dati" + "Conferma acquisizione dati".
6. Dashboard: minimalist, shows profile status, action rows, and the last 3 shares with view/confirm status.
7. Product event tracking to MongoDB (`product_events` collection): user_registered, fiscal_profile_started/completed/updated, share_created, share_opened, share_confirmed, onboarding_viewed.

## Stack
- **Backend**: FastAPI + Motor + MongoDB. All routes under `/api`. bcrypt (12 rounds, off-loaded to threadpool) + PyJWT (HS256, 30-day access token). Password reset via SHA-256 hashed one-time token (TTL 30 min) stored in `password_resets` with TTL index. Forgot returns `dev_reset_token` only when `ENV=development`.
- **Frontend**: Expo Router (React Native + Web). Design personality "Glass/Luxe DARK" — obsidian black surfaces, emerald `#059669` brand, serif display (Georgia fallback for Fraunces), Satoshi/system for body, `expo-image`, `expo-linear-gradient`, `expo-camera`, `react-native-qrcode-svg`, `expo-secure-store` (native) / `AsyncStorage` (web).
- **Data**: MongoDB collections `users`, `fiscal_profiles`, `shares`, `product_events`, `password_resets`. Unique indexes on `users.email`, `fiscal_profiles.user_id`, `shares.share_token`.

## Routes
- `/` – auth-aware redirect (welcome vs dashboard)
- `/welcome`, `/register`, `/login`, `/forgot-password`
- `/onboarding` – 3-step value carousel
- `/dashboard`, `/card`, `/fiscal-profile/edit`, `/history`
- `/share` – QR + copy link (authenticated)
- `/scanner` – operator in-app scanner (native only; web shows fallback)
- `/share/[token]` – **public** operator page (no auth). Works on iOS, Android and Web.

## Out of scope for MVP
Invoice issuance, SDI integration, TeamSystem/Zucchetti integrations, payments, cashback, loyalty, AI, OCR, document management, wallet, chat, complex notifications, Apple/Google Wallet passes (design is compatible but not implemented).

## Business hook (bonus)
The Aha! metric is: **profile completed → share created → operator opens share → operator confirms acquisition**. This end-to-end funnel is captured through the `product_events` collection and drives future B2B pricing (operator seat) and premium tier (multiple identities, revoke/expire policies, Apple/Google Wallet pass generation).
