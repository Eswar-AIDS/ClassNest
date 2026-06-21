import { ArrowUpRight, ExternalLink, FileText, Pencil, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function MaterialCard({ material, teacher, classId, unitId, onDelete }) {
  const navigate = useNavigate()
  const external = material.type === 'link'
  const open = () => navigate(`/materials/${material.id}`)
  const action = (event, callback) => {
    event.stopPropagation()
    callback()
  }

  return <div role="link" tabIndex={0} onClick={open} onKeyDown={event => event.key === 'Enter' && open()} className="group flex min-h-24 cursor-pointer items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-card">
    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">{external ? <ExternalLink size={19} /> : <FileText size={19} />}</span>
    <div className="min-w-0 flex-1">
      <h3 className="truncate font-semibold text-slate-900">{material.title}</h3>
      <p className="mt-1 text-xs font-medium text-slate-500">{external ? 'External resource' : 'Study notes'}</p>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      {teacher && <>
        <button type="button" title="Edit material" aria-label={`Edit ${material.title}`} onClick={event => action(event, () => navigate(`/classes/${classId}/units/${unitId}/materials/${material.id}/edit`))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-brand-700"><Pencil size={16} /></button>
        <button type="button" title="Delete material" aria-label={`Delete ${material.title}`} onClick={event => action(event, () => onDelete(material))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
      </>}
      <button type="button" title="Open material" aria-label={`Open ${material.title}`} onClick={event => action(event, open)} className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-700"><ArrowUpRight size={17} /></button>
    </div>
  </div>
}
