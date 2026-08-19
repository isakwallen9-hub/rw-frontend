# Frontend buggkontroll — rapport

Datum: 2026-08-04
Omfattning: hela `src/` (React 18 + Vite + TypeScript + Tailwind)

## Sammanfattning

| Allvarlighetsgrad | Antal | Status |
|---|---|---|
| Kritisk | 15 (TypeScript) | ✅ Alla fixade |
| Hög | 2 (kraschrisker) | ✅ Alla fixade |
| Medel | 2 (kraschhärdning + död UI) | ✅ Fixade |
| Låg | 5 (timers, UI-tillstånd, npm audit) | 📋 Rapporterade nedan |

Verifierat: `tsc -b` = **0 fel**, `npm run build` = **grönt**.

> Not om verktyget: `npx tsc --noEmit` på rot-`tsconfig.json` är en **no-op** (solution-style config med `files: []` + references). Riktig typkontroll sker med `tsc -b` (eller `npm run build`), som kör `tsconfig.app.json` med `noUnusedLocals`/`noUnusedParameters`. Alla siffror nedan avser `tsc -b`.

---

## 1. TypeScript — ✅ 15 → 0 fel

| Fil | Fel | Åtgärd |
|---|---|---|
| `Dashboard.tsx` (×4) | `guard()`-hjälparen returnerade `(v: T) => void`, men `Promise.finally` kräver `() => void` | Gjorde parametern valfri: `(v?: T) => { if (!cancelled) fn(v as T) }` |
| `AiAssistant.tsx:167`, `Insights.tsx:224` | Recharts `Tooltip formatter` med `(v: number)` matchar inte `ValueType` | `formatter={(value) => [Number(value).toLocaleString('sv-SE'), undefined]}` |
| `AiAssistant.tsx:453` | `title`-prop finns inte på Lucide-ikonen `<Brain>` | Lindade ikonen i `<span title=…>` (behåller tooltip, giltig typ) |
| `Actions, Admin, Analytics, Breakeven, Cashflow, Invoices, Runway` (×7) | Oanvänd `const navigate = useNavigate()` (refaktoreringsrest) | Tog bort deklaration **och** import i varje fil |
| `Simulate.tsx:61` | Oanvänd funktion `fmtPct` | Tog bort |

Eftersom bygget nu passerar med `noUnusedLocals`/`noUnusedParameters` finns **inga oanvända importer eller variabler** kvar i hela kodbasen.

---

## 2. API-parsning — ✅ granskad, 3 luckor härdade

Alla ~85 `fetchWithAuth`-anrop granskades. Kodbasen är genomgående **väl skyddad**: `Array.isArray`-vakter, `?? []`/`?? {}`-fallbacks och `.then().catch()` runt varje parsning (parsningsfel fångas → degraderar till MOCK/feltillstånd, kraschar aldrig sidan). Dessutom finns en global `ErrorBoundary` som fångar renderingsfel.

**Endpoints med extra datalager** (`{ data: { data: [...] } }`) hanteras korrekt:
- `analytics/compare` → `parseAnalyticsData()` provar `data.data` → `data` → toppnivå → `[]`.
- `analytics/compare` i Simulate → `json2?.data?.data` med `Array.isArray`.

### Härdat (var tekniskt korrekta men saknade sista vakten)
- **`Dashboard.tsx` (recommendations/top3, båda kopiorna)** — `actions.map(...)` saknade `Array.isArray`. Lade till vakt + koercerade varje fält (`String(a.id ?? …)` osv.) så att kartan matchar `Recommendation`-typen (även runtime-säkrare). *(Fanns fångat av `.catch` → ej krasch, men nu korrekt.)*

### Endpoint → läst sökväg (urval)

| Endpoint | Sökväg som läses | Vakt |
|---|---|---|
| `auth/me` | `json.data?.user ?? json.data ?? json` | ✅ |
| `currency/rates` | `json.data?.rates ?? json.data ?? json.rates ?? json ?? {}` | ✅ |
| `dashboard/overview` | `setOverview(json)` → `overview?.data?.summary?.…` | ✅ optional chaining |
| `cashflow/current` | `Array.isArray(json?.data?.series) ? … : []` | ✅ |
| `cashflow/runway` | `json?.data?.runwayDays` / `json?.data ?? MOCK` | ✅ |
| `recommendations/top3` | `json.data?.actions ?? json.data ?? json ?? []` + `Array.isArray` | ✅ (härdad) |
| `insights` | `Array.isArray(json?.data) ? … : []` | ✅ |
| `analytics/categories` | `Array.isArray(json?.data?.categories) ? … : Array.isArray(json?.data) ? … : []` | ✅ |
| `analytics/compare` | `parseAnalyticsData()` (data.data → data → []) | ✅ |
| `analytics/seasonal` | `Array.isArray(json?.data) ? … : json?.data?.months` | ✅ |
| `diagnosis` / `diagnosis/root-cause` | `json?.data ?? json` / `Array.isArray(json?.data) ? … : []` | ✅ |
| `admin/stats` / `organisations` / `users` | `json.data?.x ?? json.data ?? json ?? []` + `Array.isArray` | ✅ |
| `customers` | `json.data?.customers` + `Array.isArray` | ✅ |
| `goals/budget` | `d.budgetVsActual?.inflow/outflow` + `Number()` | ✅ |
| `ai/prepare-action` / `ai/ask` | `json?.data ?? json` + per-fält `??` | ✅ |
| `insights/generate-chart` | `json.data ?? json`; `Array.isArray(json.suggestions)` | ✅ |
| POST/PUT/DELETE (reminders, goals, progress, notifications, memory-consent, conversations…) | endast `res.ok`-koll | ✅ låg risk |

---

## 3. Kraschrisker — ✅ 2 höga fixade

| Fil | Problem | Fix | Allvar |
|---|---|---|---|
| `Customers.tsx:104` | `c.name.toLowerCase()` i `useMemo` — kraschar om en kund saknar `name` (kastar i render → ErrorBoundary) | `(c.name ?? '').toLowerCase()` | **Hög** |
| `Insights.tsx:395` | `data?.insights ? [...data.insights]` — spridning kastar om `insights` är ett sant men icke-itererbart värde | `Array.isArray(data?.insights) ? …` | **Medel** |

Övriga `.map/.filter/.reduce/.slice/.length`: kontrollerade — samtliga körs antingen på state som garanteras vara array (satt via `Array.isArray`-vakt) eller inuti `.then().catch()`. `.toLowerCase()`-anrop är annars på lokala strängar (filnamn, headers) eller skyddade med `?.` (Admin).

---

## 4. Refaktoreringsrester — ✅ städat

- **`Navbar.tsx`**: helt borttagen, **inga referenser** kvar i `src/`.
- **Gamla coach-panelen**: `Tour.tsx` hade två guidningssteg som pekade på DOM-ankare som inte längre finns (`data-tour="coach-button"` från coach-panelen och `data-tour="import-link"` från gamla Navbar). Endast `kpi-cards` och `cashflow-chart` finns kvar i DOM. Guidningen kraschade inte (visar steget centrerat utan markering) men var förvirrande. **Borttog båda döda stegen.** Guidningen är nu: Välkommen → KPI-kort → Kassaflödesgraf.
- **Oanvända filer**: inga. Alla 32 `.ts/.tsx`-filer importeras/används.
- **Oanvända importer/variabler**: inga (garanterat av `tsc -b`).
- Not: `Dashboard.tsx` har två parallella fetch-vägar (namngivna `fetchOverview/…` för `refreshAllData` efter snabbregistrering, och inline `guard`-versioner vid mount med avbrytning). Båda används — **inte död kod**, men en möjlig framtida förenkling (låg prioritet).

---

## 5. State & effekter — ✅ inga loopar/läckor av betydelse

- **Analytics (tidigare infinite-loop)**: löst. De tre debounced-effekterna (300/500 ms) har korrekt cleanup (`clearTimeout(timer); controller.abort()`) och stabila dependencies (`groupBy`, `series`, `selectedCats` m.fl. är alla `useState` — effekternas egna `setState` rör inte dependencies). **Ingen loop.**
- **`setInterval`**: används inte någonstans.
- **Låg severity — timers utan cleanup vid unmount** (ofarligt i React 18, sätter bara state efter unmount): toast-timeouts i `Dashboard.tsx:501,522`, `Customers.tsx:174`; fokus-timeout `AiAssistant.tsx:312`; stegväxling `Onboarding.tsx:288`; `savedTimer` i `Profile.tsx`/`Budget.tsx` rensas före ny men inte vid unmount. Rekommendation: rensa i en `useEffect`-cleanup om man vill vara petig — ingen bugg i praktiken.

---

## 6. UI-tillstånd (laddning / fel / tom) per sida

| Sida | Laddning | Fel | Tom | Kommentar |
|---|---|---|---|---|
| Dashboard | ✅ | ✅ (MOCK + cashflowError) | ✅ | komplett |
| Actions | ✅ | ✅ (→MOCK) | ✅ | komplett |
| Analytics | ✅ | ✅ | ✅ | komplett |
| Customers | ✅ | ✅ | ✅ | komplett |
| Diagnosis | ✅ | ✅ (→MOCK) | ✅ | komplett |
| Insights | ✅ | ✅ (fetchError) | ✅ | komplett |
| Budget | ✅ | ✅ | ✅ | komplett |
| Cashflow | ✅ | ✅ (→MOCK) | ✅ | komplett |
| Invoices | ✅ | ✅ | ✅ | komplett |
| Simulate | ✅ | ✅ | ✅ | komplett |
| Profile | ✅ | (best-effort) | – | ok |
| Import / Onboarding | ✅ | ✅ | ✅ | flerstegs-flöden |
| **Admin** | ✅ | ⚠️ **saknas** | ✅ | vid fetch-fel töms listorna tyst — ingen felbanner. *Låg.* |
| **Breakeven** | ✅ | ✅ | ⚠️ **svag** | om `summary` är null utan fel visas tom graf utan "ingen data"-text. *Låg.* |
| **Runway** | ✅ | ✅ | ⚠️ **svag** | om `data` är null utan fel visas tomma värden utan meddelande. *Låg.* |

**Gap att åtgärda vid tillfälle (låg severity):** Admin saknar felbanner; Breakeven/Runway saknar dedikerat tomt-tillstånd.

---

## 7. Loggar & läckor — ✅ rent

- **Inga** `console.log/warn/info/debug` i hela `src/`.
- Endast tre `console.error`, alla för **verkliga fel** utan användardata/siffror/tokens:
  - `ErrorBoundary.tsx:22` — `'[ErrorBoundary]', error, componentStack`
  - `UserContext.tsx:36` — `'UserContext /auth/me error:', err`
  - `CurrencyContext.tsx:51` — `'CurrencyContext rates error:', err`

---

## 8. Bygg & sårbarheter

- **`npm run build`**: ✅ grönt (`tsc -b` + `vite build`, ~4 s). Not: JS-bundeln är ~1,98 MB (545 kB gzip) — inte en bugg, men kandidat för code-splitting (`React.lazy` per route) om laddtid blir ett problem.
- **`npm audit`**: 6 sårbarheter (4 höga, 2 måttliga). Ingen är i runtime-appkod som exponeras för slutanvändare:

| Paket | Severity | Typ | Fix |
|---|---|---|---|
| `postcss` (≤8.5.22) | Hög | Path traversal vid source-map (endast byggtid) | `npm audit fix` (icke-brytande) |
| `brace-expansion` | Hög | DoS, transitiv (eslint/readdir-glob, byggtid) | `npm audit fix` (icke-brytande) |
| `react-router` (7.12–8.2) | Hög | CSRF-bypass i **RSC-läge** — appen använder `BrowserRouter` (SPA), **ej RSC** → gäller sannolikt inte | `npm audit fix --force` → nedgraderar till 7.11 (brytande) |
| `uuid` (<11.1.1) via `exceljs` | Måttlig | Buffer bounds i uuid v3/v5/v6 (Excel-export) | `npm audit fix --force` → `exceljs@3.4.0` (brytande) |

**Rekommendation:** kör `npm audit fix` (icke-brytande) för att åtgärda `postcss` + `brace-expansion`. De brytande (react-router, exceljs) bör hanteras medvetet — react-router-vulnen gäller sannolikt inte detta SPA. *(Ej åtgärdat automatiskt — instruktionen var "rapportera".)*

---

## Kvarstår (allt låg severity)

1. Timers utan unmount-cleanup (Del 5) — ofarligt i React 18.
2. UI-tillstånd: felbanner i Admin; tomt-tillstånd i Breakeven/Runway (Del 6).
3. npm audit: kör `npm audit fix` för de två icke-brytande; besluta om react-router/exceljs (Del 8).
4. Dashboard: valfri förenkling av de två parallella fetch-vägarna (Del 4).

---

## 9. react-router-dom: uppgradering utreddes 2026-08-05

**Åtgärd:** `npm install react-router-dom@latest`.

**Resultat:** `latest` = **7.18.2**, vilket redan var den installerade (upplösta) versionen. Kommandot höjde bara version-spec i `package.json` från `^7.13.1` till `^7.18.2`; den faktiska koden ändrades inte.

**Verifiering (allt grönt, inget bröts):**
- `tsc -b` + `npm run build`: passerar (exit 0, ~2,4 s).
- Routes: `vite preview` svarar 200 på både `/` och SPA-fallback `/dashboard`; `#root` + bundle finns i HTML. Routerkonfigurationen i `App.tsx` använder stabila 7.x-API:er (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `Outlet`, `useLocation`, `useNavigate`, `NavLink`, `Link`) som är oförändrade i 7.18.2.

**Varför uppgraderingen inte löser sårbarheten:**
Advisoryn **GHSA-qwww-vcr4-c8h2** (React Router RSC Mode CSRF Bypass, hög) täcker intervallet **7.12.0 – 8.2.0**. Högsta publicerade stabila version är 7.18.2, som **ligger inom** det sårbara intervallet. Det finns ingen fixad framåt-version publicerad (inga stabila 8.x finns, endast `pre`/`nightly`). Det innebär att en uppgradering till `@latest` **inte kan** rensa advisoryn. Enda remediering npm erbjuder är `npm audit fix --force`, som **nedgraderar** till `react-router-dom@7.11.0` (brytande, tappar 7 minor-versioner av fixar).

**Bedömning:** Advisoryn gäller **RSC-läge** (server-side React Router). Appen kör `BrowserRouter` som ren SPA utan RSC, så vektorn är **sannolikt inte nåbar** här. Rekommendation: **behåll 7.18.2**, nedgradera inte, och uppgradera när en patchad 7.18.x+/8.2.1+ släpps.

**CI-gate (`npm audit --audit-level=high`):** utan undantag **PASSERAR INTE** (exit 1). Kvar: 2 höga (react-router + transitiv react-router-dom, samma advisory) och 2 måttliga (uuid via exceljs).

### Dokumenterat CI-undantag (2026-08-06)

För att grönmarkera gaten utan att nedgradera infördes ett dokumenterat undantag:

- **`audit-exceptions.json`** (projektroten) listar advisoryn: id, paket, `added`, `review_by` (3 mån framåt = **2026-11-06**) och skäl.
- **`scripts/audit-check.mjs`** kör `npm audit --audit-level=high --json`, filtrerar bort undantagna advisories och **failar på allt annat** med severity high/critical. Ingen `|| true`, tröskeln oförändrad. Exit-koden från skriptet är gaten.
- **Automatisk utgång:** ett undantag **slutar gälla när `review_by` passerats**. Ett förfallet undantag ursäktar inte längre sitt fynd och får dessutom skriptet att **exita 1** med ett tydligt meddelande om att undantaget måste omprövas. Undantag kan alltså inte glömmas bort tyst.
- CI-steget "Security audit" kör `node scripts/audit-check.mjs`. Skriptet **skriver ut aktiva och förfallna undantag vid varje körning** (med `review_by`, plus notering om undantaget inte längre matchar något fynd).
- **Verifierat:** gaten passerar nu (react-router-advisoryn ursäktad, exit 0); **failar** om en ny high/critical-advisory tillkommer (syntetiskt fynd, exit 1); och **failar** när `review_by` satts bakåt i tiden (förfallet undantag, exit 1) och passerar igen efter återställt datum. Måttliga fynd (uuid/exceljs) ligger under `high`-tröskeln och påverkar inte gaten.

> **Ompröva undantaget** för GHSA-qwww-vcr4-c8h2 när react-router släpper en patchad version (7.18.x+/8.2.1+ utanför det sårbara intervallet 7.12.0-8.2.0). Ta då bort posten ur `audit-exceptions.json`, uppgradera `react-router-dom` och verifiera att gaten passerar utan undantag. Senast vid `review_by` (2026-11-06) ska undantaget omprövas oavsett.

### Uppdatering 2026-08-11: react-router-undantaget borttaget

`npm audit` flaggar **inte längre** GHSA-qwww-vcr4-c8h2 för `react-router-dom@7.18.2` (advisory-databasen har reviderats). Undantaget matchade inget aktuellt fynd och har därför **tagits bort** ur `audit-exceptions.json`. Ingen åtgärd på `react-router-dom` behövdes.

### Dokumenterat CI-undantag: js-yaml (2026-08-11)

En ny hög advisory tillkom: **GHSA-5p4m-2wfm-xmqj** (`js-yaml`, Quadratic CPU consumption i `!!omap`, CVE-2026-59870).

**Försök att lösa via uppgradering:** Instruktionen var att först försöka uppgradera `eslint` till senaste. Det **löser inte** advisoryn:
- `js-yaml@4.3.0` kommer transitivt via `eslint` → `@eslint/eslintrc` → `js-yaml`.
- `@eslint/eslintrc@latest` pinnar fortfarande **`js-yaml ^4.3.0`**, så även senaste eslint drar in en sårbar 4.x.
- Fixen är **inte backportad** till js-yaml 4.x (finns bara i 5.x).
- Slutsats: en eslint-uppgradering byter inte ut js-yaml → advisoryn kvarstår. (`npx eslint .` körs för övrigt inte i CI-gaten; gaten är `tsc -b`, audit-check och build.)

**Beslut:** dokumenterat undantag enligt samma process. Skäl: **rent dev-/byggtidsberoende som inte ingår i produktionsbundlen** (Vite bundlar endast `src/`). `review_by` = **2026-11-11** (3 mån framåt). Omprövas när `@eslint/eslintrc` släpper en version på js-yaml 5.x.

**Gate-status (2026-08-11):** `node scripts/audit-check.mjs` → **PASSERAR** (js-yaml ursäktat; inga andra high/critical utanför undantag). `tsc -b` och `npm run build` gröna.

### Uppdatering 2026-08-13: nanoid åtgärdad + js-yaml-undantaget borttaget

En ny hög advisory tillkom: **GHSA-2v37-7h3g-55p8** (`nanoid`, oändlig loop i custom-generator när `size` är 0), transitivt via **postcss** (byggtidsberoende, ingår inte i produktionsbundlen).

**Åtgärd (löstes utan undantag):** advisoryn gäller `nanoid < 3.3.18` och fixen är icke-brytande. Uppdaterade `postcss` → **8.5.26** (vars `^3.3.17`-range tillåter patchad nanoid) och körde `npm audit fix`, som lyfte `nanoid` **3.3.17 → 3.3.18**. Inget undantag behövdes.

**Sidoeffekt:** samma `npm audit fix` lyfte även `js-yaml` **4.3.0 → 4.3.1** (fixen för GHSA-5p4m-2wfm-xmqj blev till slut backportad till 4.x). Advisoryn flaggas inte längre, så **js-yaml-undantaget togs bort** ur `audit-exceptions.json` (som nu är tomt). Antagandet ovan ("inte backportad till 4.x") gällde vid 2026-08-11 men är inte längre sant.

**Verifiering:** `tsc -b` = 0, `npm run build` grönt, `node scripts/audit-check.mjs` → **PASSERAR utan några undantag**. Kvar i `npm audit`: endast 2 måttliga (uuid via exceljs), under high-tröskeln.

---

## 10. Tankstrecksstädning i UI-text 2026-08-05

Alla em-dash (`—`) och en-dash (`–`) i **synlig UI-text** ersatta i samtliga `.tsx` under `src/` (kolon/komma/punkt beroende på sammanhang; intervall blev "X till Y"). **Orörda enligt regel:** bindestreck i ISO-datum, negativa tal, CSS-klasser och sammansatta ord (t.ex. `AI-assistent`, `90-dagarsprognos`, `break-even`), samt fristående `'—'`-platshållare för tomma värden (tabellceller, saknad statistik, `'— kr'`) och tankstreck i kodkommentarer (ej synlig UI). Build grön efter städning.
