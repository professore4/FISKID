# FiskID — MVP + Iter 2 + Iter 3 PRD

## Vision
FiskID è una **Digital Fiscal Identity Card**. Un utente salva i propri dati fiscali una volta sola e li condivide privatamente con un operatore per l'emissione di fattura elettronica. Promise: **"Mai più comunicare a voce i tuoi dati fiscali."**

## MVP Scope (iter 1)
Auth email/password (JWT), fiscal profile con validazioni formali (VAT, CF, CAP, SDI, PEC), premium Fiscal Identity Card, condivisione via QR (token random 32 byte), pagina pubblica `/share/{token}` con conferma acquisizione, tracking eventi in MongoDB.

## Iter 2
### Multi Identità
Un utente può salvare N profili (personale, studio, azienda) con `label` e flag `is_default`. Chip switcher orizzontale nel dashboard. Soft-delete che revoca automaticamente le condivisioni attive.

### Wallet Pass (preview MVP)
- `.pkpass` strutturalmente valido (unsigned – iOS rifiuta finché non plug-in Pass Type ID + `.p12`)
- Google Wallet redirect a `pay.google.com/gp/v/save/{jwt}` (JWT HS256 placeholder – Google rifiuta finché non plug-in service account)
- Nessun cambio di codice quando arrivano le credenziali: solo env var (`APPLE_PASS_TYPE_ID`, `APPLE_TEAM_ID`, `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_CLASS_ID`)

## Iter 3 (questa iterazione)
### Home mode toggle
Dashboard top: bottoni segmentati **"Sto pagando" / "Sto incassando"**
- Sto pagando (default): mostra identità + card + azioni condividi
- Sto incassando: mostra CTA "Apri scanner" per acquisire il QR del cliente

### Delegati (solo profili aziendali)
- L'amministratore (proprietario di un profilo `company`) invita delegati via email + sceglie permessi `send` / `receive` / entrambi
- Se l'email invitata è già registrata → stato `active` immediato, altrimenti `invited` fino al register (auto-link on register e on login)
- Il delegato vede il profilo aziendale nel dashboard con chip tratteggiato + badge DEL + banner giallo "Sei delegato di <admin> · <perm>"
- Il delegato **non** può modificare/eliminare/impostare come default. Bottoni "Modifica dati" e "Delegati" nascosti; se tenta `PUT /fiscal-profiles/{id}` ottiene 404
- Il delegato può creare una condivisione se ha permesso `send`; con solo `receive` il bottone Condividi è disabilitato (backend risponde 403)
- L'admin gestisce delegati in `/delegates/{profileId}`: elenco, toggle permessi in-place, revoca
- Endpoint: `GET/POST /api/fiscal-profiles/{id}/delegates`, `PATCH/DELETE /api/fiscal-profiles/{id}/delegates/{delegate_id}`

## Stack
Backend FastAPI + Motor + MongoDB, bcrypt 12 rounds off-thread, PyJWT HS256 30-day token. Collections: `users`, `fiscal_profiles` (multi + soft-delete), `shares`, `product_events`, `password_resets` (TTL), `delegates` (unique per profile+email). Frontend Expo Router web+native, `expo-image`, `expo-linear-gradient`, `expo-camera`, `react-native-qrcode-svg`, `expo-secure-store` / `AsyncStorage`.

## Routes
- `/`, `/welcome`, `/register`, `/login`, `/forgot-password`
- `/onboarding` – 3-step value carousel
- `/dashboard` – mode toggle + identity switcher + card + actions + history
- `/card?id=` – detail + wallet buttons (or delegate banner) + sticky share CTA
- `/fiscal-profile/edit?id=` – create/update/delete (owner-only; delegates get redirected)
- `/delegates/[profileId]` – admin-only management of company delegates
- `/share?id=` – QR + copy link for the selected identity
- `/scanner` – in-app QR scanner (native only)
- `/history` – full share history
- `/share/[token]` – public operator page (no auth)

## Test coverage
- iter 1: 23/23 pytest — auth + fiscal + shares
- iter 2: 23/23 pytest — multi identity + wallet
- iter 3: 28/28 pytest — delegates + auto-link + permission enforcement
- **Total 74/74 pytest green**, tutti i flow frontend verificati via Playwright su Expo Web preview

## Out of scope
Emissione fattura elettronica, SDI, TeamSystem/Zucchetti, pagamenti, cashback, loyalty, AI, OCR, chat, notifiche complesse, **firma reale** dei Wallet pass (struttura pronta, credenziali pending).
