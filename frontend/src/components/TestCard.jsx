import { ArrowRight, Clock, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function TestCard({ test }) {
  return <Link to={`/tests/${test.id}`} className="group flex min-h-24 items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-card">
    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">{test.questions?.length || 0}</span>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <h3 className="truncate font-semibold text-slate-900">{test.title}</h3>
        {!test.is_published && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500"><Lock size={10} />Draft</span>}
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Clock size={13} />{test.duration_minutes} min · {test.questions?.length || 0} questions</p>
    </div>
    <ArrowRight size={17} className="text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand-600" />
  </Link>
}
