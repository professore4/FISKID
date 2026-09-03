# FiskID — MVP + Iter 2 + Iter 3 + Iter 4 PRD

## Vision
FiskID è una **Digital Fiscal Identity Card**. Ogni utente salva i propri dati fiscali una volta sola e li condivide privatamente con l'operatore per la fatturazione elettronica. Promise: **"Mai più comunicare a voce i tuoi dati fiscali."**

## Iter 1 — MVP core
Auth email/password (JWT + bcrypt), fiscal profile con validazioni formali (VAT/CF/CAP/SDI/PEC), premium Fiscal Identity Card, condivisione via QR (token random 32 byte), pagina pubblica `/share/{token}` con "Conferma acquisizione dati", tracking eventi in MongoDB.

## Iter 2 — Multi Identità + Wallet Pass
- Multi profili per utente con `label` + `is_default` + soft-delete che revoca automaticamente le condivisioni attive
- Wallet Pass endpoint scaffolding: `.pkpass` strutturalmente valido (unsigned) + redirect Google Wallet `pay.google.com/gp/v/save/{jwt}`. Le credenziali reali si aggiungono via env var senza modifiche di codice

## Iter 3 — Mode toggle + Delegati aziendali
- Home dashboard con toggle **Sto pagando / Sto incassando**
- Sistema delegati per profili aziendali: admin invita per email + assegna permessi `send` / `receive`; auto-link on register/login; delegato vede il profilo con chip tratteggiato + banner "Sei delegato di …"; non può modificarlo (backend rifiuta con 404); permessi enforced sulle share (403 senza `send`)

## Iter 4 — Login per identifier + PIN/biometric
- `POST /api/auth/login` accetta `identifier` (email, P.IVA 11 cifre, o CF 16 caratteri). Body legacy `{email}` ancora supportato
- Login screen mostra un unico input "Email, P.IVA o codice fiscale" + checkbox "Ricordami" (persiste l'identifier in SecureStore/AsyncStorage)
- Protezione device: al primo login l'utente crea un **PIN a 6 cifre** con toggle opzionale per **biometria** (Face ID / Touch ID via `expo-local-authentication` — solo native)
- Route: `/set-pin` (creazione + conferma), `/lock` (unlock con PIN keypad + fallback biometrico), `/settings` (cambio PIN, disattivazione, toggle biometria, dimentica identificativo, blocca ora, esci)
- PIN memorizzato **solo lato client** (SHA-256 in SecureStore su native, AsyncStorage su web) — il server non ne è a conoscenza
- Il flow di apertura app: se c'è token + PIN attivo → `/lock`; se token + nessun PIN → `/set-pin`; altrimenti `/welcome`

## Stack
Backend FastAPI + Motor + MongoDB, bcrypt 12 rounds threadpool, PyJWT HS256 30-day. Collections: `users`, `fiscal_profiles`, `shares`, `product_events`, `password_resets`, `delegates`. Frontend Expo Router web+native con `expo-image`, `expo-linear-gradient`, `expo-camera`, `react-native-qrcode-svg`, `expo-secure-store`, `expo-local-authentication`.

## Routes
- `/`, `/welcome`, `/register`, `/login`, `/forgot-password`
- `/onboarding` (3-step value carousel)
- `/set-pin` (create/change PIN), `/lock` (unlock), `/settings`
- `/dashboard` (mode toggle + identity switcher + card + actions + history)
- `/card?id=` — detail + wallet buttons (o delegate banner)
- `/fiscal-profile/edit?id=` — create/update/delete (owner-only)
- `/delegates/[profileId]` — admin-only
- `/share?id=` — QR + copy link
- `/scanner` — in-app scanner (native)
- `/history` — full share history
- `/share/[token]` — public operator page (no auth)

## Test coverage
- iter 1: 23/23 (auth + fiscal + shares)
- iter 2: 23/23 (multi identity + wallet)
- iter 3: 28/28 (delegates + auto-link + permessi)
- iter 4: 15/15 (login by identifier + backward compat + normalization)
- **Total 89/89 pytest green** + Playwright e2e verified per iterazione

## Out of scope
Emissione fattura elettronica, SDI, TeamSystem/Zucchetti, pagamenti, cashback, loyalty, AI, OCR, chat, notifiche complesse, **firma reale** Wallet pass.
