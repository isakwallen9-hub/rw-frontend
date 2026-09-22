import { AlertTriangle, Info } from 'lucide-react'
import type { ImportConflict } from '../utils/importConflict'
import { formatConflictDate } from '../utils/importConflict'

// Confirmation dialog shown when commit returns 409. Two choices: cancel, or
// import anyway (the caller re-commits with confirmDuplicate: true).
export function DuplicateWarning({ conflict, busy = false, onCancel, onConfirm }: {
  conflict: ImportConflict
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const overlap = conflict.kind === 'overlap'
  const dateStr = formatConflictDate(conflict.importedAt)
  const rows = conflict.rowCount

  const detail = [
    dateStr ? `den ${dateStr}` : '',
    rows != null ? `med ${rows.toLocaleString('sv-SE')} rader` : '',
  ].filter(Boolean).join(' ')

  const title = overlap ? 'Filen överlappar med tidigare data' : 'Filen verkar redan importerad'

  const message = overlap
    ? `Den här filen överlappar delvis med data du redan importerat${detail ? ` (${detail})` : ''}. Importerar du ändå kan vissa transaktioner räknas dubbelt.`
    : `Den här filen verkar redan vara importerad${detail ? ` ${detail}` : ''}. Importerar du den igen kommer siffrorna att räknas dubbelt.`

  const Icon = overlap ? Info : AlertTriangle

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/20 backdrop-blur-md"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6 animate-in"
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${overlap ? 'bg-brand-50 text-brand-600' : 'bg-caution-50 text-caution-700'}`}>
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>
          <h2 className="text-sm font-semibold text-ink-900 mt-1.5">{title}</h2>
        </div>

        <p className="text-sm text-ink-700 leading-relaxed mb-6">{message}</p>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-2xl text-sm font-semibold border transition-[transform,background-color,border-color] duration-150 active:scale-[0.98] disabled:opacity-50 ${
              overlap
                ? 'border-ink-200 text-ink-700 hover:bg-ink-50'
                : 'border-caution-300 text-caution-700 hover:bg-caution-50'
            }`}
          >
            {busy && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
            {busy ? 'Importerar…' : 'Importera ändå'}
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-2xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:scale-[0.98] transition-[transform,background-color] duration-150 disabled:opacity-50"
          >
            Avbryt
          </button>
        </div>
      </div>
    </div>
  )
}
