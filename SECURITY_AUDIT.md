# Säkerhetsrevision — RW Systems Frontend
**Datum:** 2026-07-02  
**Scope:** Hela frontend-kodbasen (src/, .env, git-historik)  
**Status:** 🔴 Kräver åtgärder innan produktionssättning

---

## Sammanfattning

| Kategori | Fynd | Allvarlighet |
|---|---|---|
| Console.log-läckor | 10 loggar exponerar PII och finansiell data | 🔴 Hög |
| npm-sårbarheter | 9 st (5 höga, 3 medel, 1 låg) | 🔴 Hög |
| Logout saknar rensning | `rw_coach_history` rensas inte vid utloggning | 🟡 Medel |
| `.env` i git-historik | Produktions-URL committad utan `.gitignore`-skydd | 🟡 Medel |
| Onödig dependency | `axios` installerat men aldrig använt | 🟡 Medel |
| Admin-skydd frontend-only | Backend-skydd ej verifierat i revision | ℹ️ Info |
| XSS | Inga fynd | ✅ OK |
| Hemligheter i kod | Inga fynd | ✅ OK |
| Token-hantering | refreshToken korrekt i httpOnly cookie | ✅ OK |

---

## 1. Exponerade hemligheter

### ✅ Inga hemligheter i källkoden
Genomsökning av alla `.ts`/`.tsx`-filer efter `API_KEY`, `SECRET`, `PRIVATE_KEY`, `PASSWORD` gav inga träffar. Enda VITE-variabeln är `VITE_API_URL` som är en publik URL — detta är korrekt.

### 🟡 Produktions-URL committad i git-historik
Produktionsbackendens URL committades i `.env` i commit `ed19771` och `4395c23`:
```
VITE_API_URL=https://divine-warmth-production.up.railway.app/
```
Det är ingen hemlighet (det är en publik API-endpoint), men det exponerar infrastrukturdetaljer.

**Allvarlighet:** Låg-medium — en angripare kan använda URL:en för att skanna backend-endpoints.

**Åtgärd:**
```bash
# .gitignore — lägg till:
.env
.env.*
!.env.example
```
Lägg produktions-URL i Vercels environment variables istället, inte i `.env`.

### 🟡 `.env` saknas i `.gitignore`
Aktuell `.gitignore` exkluderar `*.local` men inte `.env`. Det innebär att en `.env` med riktiga nycklar riskerar att råka committas.

**Åtgärd:** Se ovan — lägg till `.env` i `.gitignore` omedelbart.

---

## 2. Token-hantering

### ✅ `refreshToken` i httpOnly cookie — korrekt
`fetchWithAuth.ts` använder `credentials: 'include'` på refresh-anropet. Refresh-token hanteras aldrig i JavaScript — korrekt arkitektur.

### ✅ `accessToken` i localStorage — acceptabelt med känd risk
`accessToken` lagras i `localStorage`. Detta är standard SPA-arkitektur men innebär att en XSS-attack kan stjäla token. Eftersom inga XSS-vektorer hittades (se avsnitt 3) är risken låg i nuläget.

**Åtgärd (rekommenderad, ej akut):** Om säkerhetskraven ökar — flytta `accessToken` till en `memory`-variabel (in-memory, nollställs vid page refresh) och hantera refresh-flödet via cookie.

### 🟡 `rw_coach_history` rensas inte vid utloggning
Utloggningsflödet i `Navbar.tsx` och `fetchWithAuth.ts clearSession()` tar bort `accessToken` men lämnar kvar:
- `rw_coach_history` — AI-konversationer om användarens ekonomi (finansiell data, potentiellt känslig)

**Berörd fil:** [src/components/Navbar.tsx](src/components/Navbar.tsx)  
**Åtgärd:**
```ts
// Navbar.tsx handleLogout + fetchWithAuth.ts clearSession — lägg till:
localStorage.removeItem('rw_coach_history')
```

### ✅ Utloggning rensar rätt data
Båda utloggningsflödena (`Navbar.tsx` och `clearSession()` i `fetchWithAuth.ts`) gör:
- `localStorage.removeItem('accessToken')` ✅
- `clearUserImportHistory()` ✅
- POST till `/api/v1/auth/logout` med `credentials: 'include'` (invaliderar httpOnly cookie) ✅

---

## 3. XSS-skydd

### ✅ Inga XSS-vektorer hittade
Genomsökning av hela `src/` efter:
- `dangerouslySetInnerHTML` → **0 träffar**
- `eval(` → **0 träffar**
- `new Function(` → **0 träffar**
- `innerHTML =` → **0 träffar**
- `document.write` → **0 träffar**

All användardata (transaktionsbeskrivningar, kundnamn, AI-svar) renderas via React JSX som escaping-strängar. AI-svaren i `CoachMessage` renderas som text eller via en säker `parseNumberedList()`-funktion.

---

## 4. Känslig data i console.log

### 🔴 10 console.log-anrop exponerar PII och finansiell data

Alla dessa måste tas bort innan produktion. I produktion kan loggar läsas av:
- Andra Chrome-extensions (om de har `scripting`-behörighet)
- Skärminspelningar/screenshots av DevTools
- Tredjeparts felsökningsverktyg

| Fil | Rad | Exponerar |
|---|---|---|
| `src/Dashboard.tsx` | 470 | Transaktionsdata (belopp, beskrivning, datum) |
| `src/contexts/UserContext.tsx` | 30 | Rå API-svar inkl. user-objekt |
| `src/contexts/UserContext.tsx` | 33 | Email, isAdmin, isSuperAdmin |
| `src/contexts/UserContext.tsx` | 34 | Admin-status direkt |
| `src/contexts/CurrencyContext.tsx` | 48 | Rå valutakurser API-svar |
| `src/contexts/CurrencyContext.tsx` | 50 | Resolva rates-objekt |
| `src/contexts/CurrencyContext.tsx` | 60 | Belopp, valuta, konverteringsdata |
| `src/pages/Analytics.tsx` | 327–328 | Rå analytics API-svar (finansiell data) |
| `src/pages/Analytics.tsx` | 347–348 | Analytics data-array |
| `src/pages/Budget.tsx` | 192, 210, 243, 248, 252 | Budget JSON, betalnings-payloads, feldetaljer |

**Åtgärd — ta bort eller ersätt med DEV-only-guard:**

```ts
// Alternativ 1: Ta bort raden
// console.log('UserContext resolved user:', user)   // ← ta bort

// Alternativ 2: Om du behöver loggar under development
if (import.meta.env.DEV) {
  console.log('UserContext resolved user:', user)
}
```

---

## 5. Felmeddelanden till användaren

### ✅ Generiska felmeddelanden
- Login: *"Fel workspace, e-post eller lösenord."* — avslöjar inte om email eller lösenord är fel ✅
- Inga stack traces eller tekniska detaljer visas i UI ✅

---

## 6. Admin-skydd

### ✅ Frontend-skydd implementerat korrekt
`Admin.tsx` kontrollerar `isAdmin` från `UserContext` på tre nivåer:
1. API-anrop startar inte förrän `isAdmin` är verifierat (rad 94)
2. Renderingen visar "Åtkomst nekad" om `!isAdmin` (rad 170)
3. Admin-länken i Navbar döljs för icke-admins

### ℹ️ Backend-skydd ej verifierat — måste kontrolleras
Frontend-skyddet är korrekt men **otillräckligt ensamt**. Admin-endpoints som `/api/v1/admin/*` MÅSTE skyddas på backend med:
- Autentisering (token validering)
- Auktorisering (roll-kontroll, t.ex. `requireAdmin` middleware)

**Åtgärd:** Verifiera att backend-teamet har `requireAdmin`-middleware på alla `/admin/*`-rutter. Testa manuellt med ett vanligt användarkonto mot admin-endpoints direkt.

---

## 7. Dependencies — npm audit

**Totalt: 9 sårbarheter (5 höga, 3 medel, 1 låg)**

### 🔴 Höga sårbarheter

| Paket | CVE | Beskrivning | Fix |
|---|---|---|---|
| `react-router` | GHSA-49rj-9fvp-4h2h | turbo-stream RCE via TYPE_ERROR deserialization (CVSS 8.1) | Uppdatera till ≥7.15.0 |
| `react-router` | GHSA-8646-j5j9-6r62 | XSS via `javascript:` redirect targets (CVSS 8.0) | Uppdatera till ≥7.13.2 |
| `react-router` | GHSA-8x6r-g9mw-2r78 | DoS via `__manifest` endpoint (CVSS 7.5) | Uppdatera till ≥7.15.0 |
| `form-data` | GHSA-hmw2-7cc7-3qxx | CRLF-injection i filnamn (CVSS 7.5) | `npm audit fix` |
| `tmp` | GHSA-ph9p-34f9-6g65 | Path Traversal (dev-dependency) | `npm audit fix` |

> **Notering om react-router RCE:** GHSA-49rj-9fvp-4h2h gäller server-side React Router (SSR/RSC). Eftersom RW Systems är en ren SPA utan server-side rendering är den direkta risken lägre, men versionen bör ändå uppdateras.

### 🟡 Medel-sårbarheter

| Paket | Beskrivning |
|---|---|
| `react-router` | Open redirect via `//`-prefix (GHSA-2j2x-hqr9-3h42) |
| `react-router` | Stored XSS i prerenderad redirect HTML (GHSA-f22v-gfqf-p8f3) |
| `exceljs` | Transitivt via `uuid` |
| `js-yaml` | Quadratic-complexity DoS via merge key |

### 🟢 Låg-sårbarheter

| Paket | Beskrivning |
|---|---|
| `@babel/core` | Arbitrary file read via `sourceMappingURL` (dev-only, CVSS 3.2) |

**Åtgärdssteg:**
```bash
# Steg 1 — åtgärda det som går automatiskt
npm audit fix

# Steg 2 — uppdatera react-router-dom manuellt
npm install react-router-dom@latest

# Steg 3 — verifiera
npm audit
```

---

## 8. Onödiga dependencies

### 🟡 `axios` — installerat men aldrig använt

`axios@1.16.1` finns i `package.json` men ingen fil i `src/` importerar det. Alla API-anrop använder `fetchWithAuth` (native `fetch`).

**Risk:** Onödiga dependencies ökar attack-ytan och bundle-storleken.

**Åtgärd:**
```bash
npm uninstall axios
```

---

## Åtgärdsplan — Prioritetsordning

### 🔴 Före deploy (blockerande) — ✅ Alla åtgärdade

- [x] **Ta bort alla `console.log`-anrop** som loggar finansiell data eller PII — **åtgärdat**
  - `src/Dashboard.tsx:470` — borttagen
  - `src/contexts/UserContext.tsx:30,33,34` — borttagna
  - `src/contexts/CurrencyContext.tsx:48,50,60` — borttagna
  - `src/pages/Analytics.tsx:327,328,347,348` — borttagna
  - `src/pages/Budget.tsx:192,210,243,248,252` — borttagna
- [x] **`npm audit fix` kördes** — 9 → 2 sårbarheter kvar (båda moderata, se nedan) — **åtgärdat**
- [x] **`.env` tillagd i `.gitignore`** — **åtgärdat**

### 🟡 Snarast (inom 1 sprint) — ✅ Alla åtgärdade

- [x] **`rw_coach_history` rensas nu vid utloggning** i `Navbar.tsx` och `fetchWithAuth.ts clearSession()` — **åtgärdat**
- [x] **`axios` borttaget** (`npm uninstall axios`) — **åtgärdat**
- [ ] **Verifiera att backend-adminrutter** har server-side auktorisering (`requireAdmin` middleware)

### 🟡 Återstående npm-sårbarhet (kräver manuellt beslut)

`exceljs` ≥3.5.0 använder `uuid` med en sårbarhet (GHSA-w5hq-g745-h8pq, moderat).  
Fix kräver **nedgradering till exceljs@3.4.0** som är en breaking change.

**Alternativ A** — nedgradera (säkrast):
```bash
npm audit fix --force
# Verifiera att Excel-exporten fortfarande fungerar
```

**Alternativ B** — acceptera tills ny exceljs-release (om ni inte accepterar användardata i Excel-generering):  
Risken är begränsad då `uuid`-sårbarheten kräver att attackeraren kontrollerar `buf`-argumentet i v3/v5/v6 — sannolikt ej nåbar via er use case.

### ℹ️ Långsikt

- [ ] Överväg att flytta `accessToken` från `localStorage` till in-memory storage för högre XSS-resiliens
- [ ] Sätt upp `Content-Security-Policy`-header i Vercel (`vercel.json`)
- [ ] Aktivera `SameSite=Strict` och `Secure`-flaggor på refresh-cookie (backend-ansvar)
- [ ] Lägg till `.env.example` i repot med platshollarnamn (aldrig riktiga värden)

---

## Saker som är korrekt implementerade ✅

- Inga XSS-vektorer i koden (ingen `dangerouslySetInnerHTML`, `eval`, `innerHTML`)
- `refreshToken` hanteras enbart via httpOnly cookie — aldrig i JavaScript
- Utloggning invaliderar serverns session via `POST /auth/logout`
- React JSX escapar all dynamisk data automatiskt
- Admin-UI döljs korrekt i frontend baserat på verifierad backend-roll
- Generiska felmeddelanden — inga tekniska detaljer exponeras i UI
- VITE_API_URL är enda exponerade env-variabeln — innehåller ingen hemlighet
- `fetchWithAuth` hanterar 401 och refresh-flöde korrekt
