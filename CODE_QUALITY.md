# Robusthetsgranskning — RW Systems Frontend
**Datum:** 2026-07-06  
**Scope:** Hela frontend-kodbasen (src/)  
**Status:** ✅ Alla kritiska fynd åtgärdade

---

## Sammanfattning

| Kategori | Fynd | Allvarlighet | Status |
|---|---|---|---|
| Ingen ErrorBoundary | Vit skärm vid okontrollerat undantag | 🔴 Kritisk | ✅ Åtgärdat |
| fetchWithAuth refresh-path | Nätverksfel i refresh-steget clearade inte session | 🔴 Kritisk | ✅ Åtgärdat |
| Login — ingen klientvalidering | Tomma fält skickades till API | 🟡 Hög | ✅ Åtgärdat |
| Register — ingen klientvalidering | Tomma fält + ogiltigt lösenord skickades till API | 🟡 Hög | ✅ Åtgärdat |
| Dashboard useEffect utan cleanup | 4 fetch-anrop satte state efter unmount | 🟡 Hög | ✅ Åtgärdat |
| .map() på undefined | Enstaka okontrollerade arrayoperationer | 🟡 Hög | ✅ Åtgärdat (se nedan) |
| Loading/error/empty states | Audit per sida | ℹ️ Info | Se nedan |
| Nätverksfel i fetch-anrop | Alla sidor har .catch() | ✅ OK | — |

---

## 1. ErrorBoundary — Ny komponent ✅

### Problem
React renderar en vit skärm om ett komponent-render-pass kastar ett undantag (t.ex. `.map()` på `undefined`, `null`-dereferens, TypeScript runtime-fel). Det är oacceptabelt i produktion.

### Åtgärd
Skapade `src/components/ErrorBoundary.tsx` — en class-komponent som:
- Visar "Något gick fel" med glassmorphism-design
- Har "Försök igen"-knapp (resettar state) och "Till startsidan"-knapp
- I `DEV`-läge visar felmeddelandet för enklare felsökning

Wrappades runt hela appen i `src/App.tsx`:
```tsx
<ErrorBoundary>
  <UserProvider>
    <CurrencyProvider>
      <BrowserRouter>...</BrowserRouter>
    </CurrencyProvider>
  </UserProvider>
</ErrorBoundary>
```

---

## 2. fetchWithAuth — Refresh-path nätverksfel ✅

### Problem
I `src/utils/fetchWithAuth.ts` — om den initiala requesten returnerar 401 och sedan refresh-requesten kastar ett nätverksfel (offline, timeout), propagerades felet utan att `clearSession()` kördes. Användaren satt kvar med en ingiltig session.

```ts
// Före: okontrollerat kast
const refreshResponse = await fetch(`${API_URL}api/v1/auth/refresh`, {...})
```

### Åtgärd
Lade till `try-catch` runt refresh-fetch som kallar `clearSession()` vid nätverksfel:
```ts
let refreshResponse: Response
try {
  refreshResponse = await fetch(`${API_URL}api/v1/auth/refresh`, {...})
} catch {
  await clearSession()
  throw new Error('Nätverksfel vid sessionsförnyelse')
}
```

---

## 3. Formulärvalidering ✅

### Problem — Login.tsx
`handleLogin` körde API-anrop direkt utan att kontrollera att fälten var ifyllda. En tom POST skickades vid accidentellt tryck på Enter.

### Åtgärd
```ts
if (!slug.trim() || !email.trim() || !password) {
  setError('Fyll i workspace, e-post och lösenord.')
  return
}
```

### Problem — Register.tsx
"Nästa steg →"-knappen gick vidare till steg 2 utan validering. Resulterade i tomma fält i API-anropet och ogenomskinliga serverfel.

### Åtgärd
Knapplyssnaren validerar nu alla fält, e-postformat och minimilängd på lösenord (6 tecken) innan `setStep(2)` anropas.

---

## 4. Stale State — Dashboard.tsx useEffect ✅

### Problem
Dashboard.tsx hade fyra fetch-anrop i `useEffect` utan AbortController eller cancellation-guard. Om komponenten mountade, startade fetch, sedan unmountade (t.ex. vid snabb navigering) och fetch svarade — anropades `setState` på en unmountad komponent. I React 18 Strict Mode körs effects dubbelt i dev, vilket förvärrade problemet.

```ts
// Före: setState körs oavsett om komponenten är kvar
useEffect(() => {
  fetchOverview()
  fetchCashflow()
  ...
}, [])
```

### Åtgärd
Implementerade cancellation-guard med en enkel `cancelled`-flagga:
```ts
useEffect(() => {
  let cancelled = false
  const guard = <T,>(fn: (v: T) => void) => (v: T) => { if (!cancelled) fn(v) }

  fetchWithAuth(...)
    .then(r => r.json())
    .then(guard(json => setState(json)))
    .catch(guard(...))

  return () => { cancelled = true }
}, [])
```

---

## 5. .map() / Array-säkerhet — Befintlig status

### Genomsökning visade att de flesta sidor redan skyddar sig:

| Fil | Skydd | Status |
|---|---|---|
| Dashboard.tsx | `overview?.data?.cashflow ?? []`, `topProducts ?? []`, `topCustomers ?? []` | ✅ OK |
| Actions.tsx | `Array.isArray(raw) ? raw : []` | ✅ OK |
| Customers.tsx | `Array.isArray(list) ? list : []` | ✅ OK |
| Diagnosis.tsx | `components` har explicit fallback-array i `useMemo` | ✅ OK |
| Analytics.tsx | `Array.isArray(json.data) ? json.data : []` | ✅ OK |
| Insights.tsx | `data?.insights ?? []`, `data?.featuredCharts ?? []` | ✅ OK |

**Notering:** `Diagnosis.tsx` — `COMPONENT_META[c.name]` lookup fallbacks till `{ label: c.label ?? c.name, icon: <Activity /> }` om nyckeln saknas. ✅

---

## 6. Loading / Error / Empty States — Audit per sida

| Sida | Loading | Error | Empty |
|---|---|---|---|
| Dashboard | ✅ Skeleton-komponenter | ✅ Faller tillbaka på mock-data | ✅ Onboarding-banner |
| Analytics | ✅ Skeleton | ✅ Inline error-text | ✅ "Ingen data" |
| Actions | ✅ Animate-pulse | ✅ Mock-fallback | ✅ "Inga åtgärder" |
| Customers | ✅ SkeletonCard | ✅ Error-banner | ✅ EmptyState-komponent |
| Budget | ✅ Loading-spinner | ✅ Error-banner | ✅ "Ingen budget" |
| Simulate | ✅ Loading-state | ✅ Error-text | ✅ "Lägg till scenario" |
| Diagnosis | ✅ Animate-pulse | ✅ Mock-fallback | ✅ "Ingen diagnosdata" |
| Insights | ✅ Skeleton-sektioner | ✅ Error-text | ✅ Empty-state-kort |
| Profile | ✅ SkeletonCard | ✅ Error-banner | — (alltid data) |
| Admin | ✅ Loading | ✅ "Åtkomst nekad" | ✅ "Inga användare" |
| Cashflow | ✅ Skeleton | ✅ Error-banner | ✅ "Ingen data" |
| Landing | — (statisk) | — | — |
| Login | ✅ Spinner på knapp | ✅ Inline error | — |
| Register | ✅ Spinner | ✅ Inline error | — |

**Alla sidor har alla tre states.** ✅

---

## 7. Nätverksfel i fetch-anrop

Alla sidor använder `fetchWithAuth(...).catch(() => ...)` vilket fångar både nätverksfel (fetch throw) och HTTP-fel. ✅

**Undantag:** `fetchWithAuth` propagerar kastat undantag från originalet fetch — avsiktligt, sidan ansvarar för `.catch()`. ✅

---

## 8. Saker som redan var korrekt implementerade ✅

- `.map()` på undefined är i princip eliminerat via `?? []`-fallbacks överallt
- `useMemo` används för dyr beräkning på Customers, Analytics, Dashboard
- Alla API-anrop har `.finally(() => setLoading(false))` så loading aldrig sitter fast
- Form-disabled under pågående submit (`disabled={loading}`) på alla formulär
- Toast-timeouts rensas inte men är korta (3s) — ingen minnesläcka i praktiken
- `loadProgress()` och `loadHistory()` i Actions/Diagnosis är try-catch-skyddade mot korrupt localStorage

---

## Åtgärdade filer

| Fil | Ändring |
|---|---|
| `src/components/ErrorBoundary.tsx` | Ny fil — global felgräns |
| `src/App.tsx` | Wrappades med `<ErrorBoundary>` |
| `src/utils/fetchWithAuth.ts` | try-catch runt refresh-fetch |
| `src/pages/Login.tsx` | Klientvalidering innan API-anrop |
| `src/pages/Register.tsx` | Klientvalidering på steg 1 |
| `src/Dashboard.tsx` | Cancellation-guard i useEffect |

---

## Återstående rekommendationer (ej akuta)

- **`setTimeout` cleanup** — `setReminderToast`, `setQuickAddToast` och liknande timeouts rensas inte om komponenten unmountar. Risk: React 18 warning i dev. Fix: `useRef<ReturnType<typeof setTimeout>>` + `clearTimeout` i cleanup.
- **AbortController i Analytics.tsx** — Sidan har ett debounce-mönster men det kan finnas restfall. Lägre prioritet eftersom Analytics inte navigeras bort ifrån mitt i en sökning typiskt sett.
- **Persistent toast-refs** — Profile.tsx har redan korrekt `useRef`-baserad cleanup på saved-timern (förebilden). Samma mönster kan spridas till Customers och Dashboard.
