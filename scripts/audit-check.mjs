#!/usr/bin/env node
// CI-säkerhetsgate: kör `npm audit --audit-level=high --json`, filtrerar bort
// dokumenterade undantag i audit-exceptions.json och failar på ALLT annat med
// severity high/critical. Sänker inte tröskeln och använder inte `|| true`.
//
// Testläge: sätt AUDIT_INPUT=<fil> för att läsa audit-JSON från fil i stället
// för att köra npm audit (används av verifieringstesterna).

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const GATE = new Set(['high', 'critical']) // matchar --audit-level=high
const ROOT = fileURLToPath(new URL('..', import.meta.url))

// --- Läs undantagen ---------------------------------------------------------
const exFile = new URL('../audit-exceptions.json', import.meta.url)
const exceptions = JSON.parse(readFileSync(exFile, 'utf8')).exceptions ?? []

// Ett undantag slutar gälla automatiskt när review_by passerats. Endast aktiva
// (ej förfallna) undantag ursäktar fynd; förfallna tvingar fram exit 1.
const today = new Date().toISOString().slice(0, 10)
const expired = exceptions.filter((e) => e.review_by && e.review_by < today)
const active = exceptions.filter((e) => !expired.includes(e))
const excused = new Map(active.map((e) => [e.advisory, e]))

// --- Hämta audit-data (npm audit exitar !=0 när fynd finns; fånga stdout) ----
function getAuditJson() {
  if (process.env.AUDIT_INPUT) return readFileSync(process.env.AUDIT_INPUT, 'utf8')
  try {
    return execSync('npm audit --audit-level=high --json', { cwd: ROOT, encoding: 'utf8' })
  } catch (err) {
    if (err.stdout) return err.stdout // förväntat: fynd ger exit 1 men JSON på stdout
    throw err
  }
}

const audit = JSON.parse(getAuditJson())

// --- Plocka ut distinkta high/critical-advisories ---------------------------
const advisories = new Map() // ghsaId -> { id, severity, title, package, url }
for (const vuln of Object.values(audit.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object') continue // sträng = transitiv referens, ingen egen advisory
    if (!GATE.has(via.severity)) continue
    const id = (via.url?.match(/GHSA-[0-9a-z-]+/i)?.[0]) ?? `source-${via.source}`
    if (!advisories.has(id)) {
      advisories.set(id, { id, severity: via.severity, title: via.title, package: via.name ?? via.dependency, url: via.url })
    }
  }
}

// --- Redovisa undantag varje körning ----------------------------------------
console.log('── npm audit-gate (high/critical) ─────────────────────────────')
if (active.length === 0) {
  console.log('Aktiva undantag: inga.')
} else {
  console.log(`Aktiva undantag (${active.length}):`)
  for (const e of active) {
    const matched = advisories.has(e.advisory)
    console.log(`  • ${e.advisory} [${e.package}] tillagt ${e.added}, omprövas senast ${e.review_by}` +
      `${matched ? '' : '  ⚠️ matchar inget aktuellt fynd (kan vara inaktuellt)'}`)
    console.log(`      skäl: ${e.reason}`)
  }
}
if (expired.length) {
  console.log(`\n⛔ FÖRFALLNA undantag (${expired.length}) – gäller inte längre, måste omprövas:`)
  for (const e of expired) {
    console.log(`  • ${e.advisory} [${e.package}] granskningsdatum ${e.review_by} har passerats (idag ${today}).`)
  }
}

// --- Dela upp fynd i ursäktade vs blockerande -------------------------------
const blocking = []
const waived = []
for (const a of advisories.values()) (excused.has(a.id) ? waived : blocking).push(a)

if (waived.length) {
  console.log(`\nUrsäktade fynd (${waived.length}):`)
  for (const a of waived) console.log(`  ✓ ${a.id} ${a.severity} – ${a.package}: ${a.title}`)
}

if (blocking.length) {
  console.log(`\n❌ Blockerande high/critical-fynd utan giltigt undantag (${blocking.length}):`)
  for (const a of blocking) console.log(`  ✗ ${a.id} ${a.severity} – ${a.package}: ${a.title}\n    ${a.url ?? ''}`)
}

if (expired.length) {
  console.log(`\n❌ Gaten FAILAR: ${expired.length} undantag har passerat sitt granskningsdatum (review_by) och gäller inte längre.`)
  console.log('   Ompröva undantaget i audit-exceptions.json: ta bort det om det är åtgärdat, annars förnya review_by med ett nytt motiverat datum.')
  process.exit(1)
}

if (blocking.length) {
  console.log('\nGaten FAILAR. Åtgärda sårbarheten eller lägg ett dokumenterat undantag i audit-exceptions.json.')
  process.exit(1)
}

console.log('\n✅ Gaten PASSERAR: inga high/critical-fynd utanför giltiga, ej förfallna undantag.')
process.exit(0)
