# RW Systems — Frontend

## Projektbeskrivning
RW Systems är ett modernt affärssystem och BI-verktyg (Business Intelligence) som passar företag av alla storlekar. Systemet erbjuder kassaflödesanalys, AI-driven ekonomicoach, scenariosimuleringar, budgetuppföljning, kundanalys och exportfunktioner — allt i ett enkelt och kraftfullt gränssnitt. React/Vite/TypeScript/Tailwind. Hosting: Vercel.

## Tech Stack
- React 18 + Vite + TypeScript
- Tailwind CSS (utility-first)
- Recharts (grafer)
- lucide-react (ikoner)
- `fetchWithAuth` (alltid använda för API-anrop — hanterar token refresh automatiskt)

## Viktiga Konventioner
- ALLTID använda `fetchWithAuth` istället för vanlig `fetch` för autentiserade anrop
- `credentials: 'include'` på alla auth-anrop (`/auth/*`)
- Alla belopp formateras via `formatAmount()` från CurrencyContext
- Svenska texter överallt — inga engelska labels i UI
- Mobile-first: alltid lägg till `sm:` breakpoints
- Minimum touch target: 44px höjd på knappar

## Contexts
- `CurrencyContext` — `formatAmount()`, `currency`, `setCurrency`
- `UserContext` — `isAdmin`, `isSuperAdmin`, `email`, `loading`

## Sidor
- `/` — Dashboard
- `/analys` — Analytics
- `/simulera` — Simulate
- `/importera` — Import
- `/budget` — Budget
- `/kunder` — Customers
- `/åtgärder` — Actions
- `/diagnos` — Diagnosis
- `/profil` — Profile
- `/admin` — Admin (kräver `isAdmin`)

## API Base URL
`import.meta.env.VITE_API_URL` (`http://localhost:3000/` lokalt)

## GitHub
Repo: `isakwallen9-hub/rw-frontend`, branch: `main`
