import { ArrowRight, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function UnitCard({ unit, classId, canEdit = false, onDelete }) {
  const navigate = useNavigate()

  const openUnit = () => navigate(`/units/${unit.id}`)
  const editUnit = event => {
    event.stopPropagation()
    navigate(`/classes/${classId}/units/${unit.id}/edit`)
  }
  const deleteUnit = event => {
    event.stopPropagation()
    onDelete(unit)
  }

  return <div
    role="link"
    tabIndex={0}
    onClick={openUnit}
    onKeyDown={event => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        openUnit()
      }
    }}
    className="group grid cursor-pointer grid-cols-[40px_1fr_auto] items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-card focus-visible:ring-4 focus-visible:ring-brand-100 sm:grid-cols-[48px_1fr_auto] sm:p-5"
  >
    <span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600 sm:size-12">{String(unit.order_number).padStart(2, '0')}</span>
    <div className="min-w-0 pt-0.5">
      <p className="text-[11px] font-bold uppercase tracking-[.13em] text-brand-700">Unit {unit.order_number}</p>
      <h3 className="mt-1 font-bold tracking-tight text-slate-900">{unit.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{unit.description || 'Open this unit to view its learning resources.'}</p>
    </div>
    <div className="mt-1 flex items-center gap-1.5 self-center">
      {canEdit && <button
        type="button"
        onClick={editUnit}
        onKeyDown={event => event.stopPropagation()}
        aria-label={`Edit ${unit.title}`}
        title="Edit unit"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
      >
        <Pencil size={14} />
        <span className="hidden sm:inline">Edit</span>
      </button>}
      {canEdit && <button type="button" onClick={deleteUnit} onKeyDown={event => event.stopPropagation()} aria-label={`Delete ${unit.title}`} title="Delete unit" className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>}
      <button type="button" onClick={event => { event.stopPropagation(); openUnit() }} onKeyDown={event => event.stopPropagation()} aria-label={`Open ${unit.title}`} title="Open unit" className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-700"><ArrowRight size={18} className="transition group-hover:translate-x-1" /></button>
    </div>
  </div>
}
