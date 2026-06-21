import { ArrowRight, ClipboardList, Clock, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function AssessmentCard({ assessment, teacher, classId, unitId, onDelete }) {
  const navigate = useNavigate()
  const status = assessment.archived ? 'Archived' : assessment.results_published ? 'Results published' : assessment.is_accepting_responses ? 'Open' : assessment.is_published ? 'Closed' : 'Draft'
  const style = assessment.archived ? 'bg-slate-200 text-slate-600' : assessment.results_published ? 'bg-violet-50 text-violet-700' : assessment.is_accepting_responses ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
  const open = () => navigate(!teacher && assessment.results_published ? `/assessments/${assessment.id}/result` : `/assessments/${assessment.id}`)
  const action = (event, callback) => {
    event.stopPropagation()
    callback()
  }

  return <div role="link" tabIndex={0} onClick={open} onKeyDown={event => event.key === 'Enter' && open()} className="group flex min-h-24 cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-card">
    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">{assessment.question_count}</span>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-slate-900">{assessment.title}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style}`}>{status}</span></div><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Clock size={13} />{timingLabel(assessment)} · {assessment.question_count} questions</p></div>
    <div className="flex shrink-0 items-center gap-1">
      {teacher && <>
        <button type="button" title="Edit assessment" aria-label={`Edit ${assessment.title}`} onClick={event => action(event, () => navigate(`/classes/${classId}/units/${unitId}/assessments/${assessment.id}/edit`))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-700"><Pencil size={16} /></button>
        <button type="button" title="Manage assessment" aria-label={`Manage ${assessment.title}`} onClick={event => action(event, () => navigate(`/classes/${classId}/units/${unitId}/assessments/${assessment.id}/manage`))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-700"><ClipboardList size={16} /></button>
        <button type="button" title="Delete assessment" aria-label={`Delete ${assessment.title}`} onClick={event => action(event, () => onDelete(assessment))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
      </>}
      <button type="button" title={teacher ? 'Preview assessment' : assessment.results_published ? 'View result' : 'Open assessment'} aria-label={`Open ${assessment.title}`} onClick={event => action(event, open)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700"><ArrowRight size={17} /></button>
    </div>
  </div>
}

function timingLabel(assessment) {
  const due = assessment.ends_at ? `Due ${serverDate(assessment.ends_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : ''
  if (assessment.timing_mode === 'timed') return `${assessment.duration_minutes} min`
  if (assessment.timing_mode === 'deadline') return due || 'Deadline'
  if (assessment.timing_mode === 'timed_deadline') return `${assessment.duration_minutes} min${due ? ` · ${due}` : ''}`
  return 'No time limit'
}

function serverDate(value) {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}
