import { ArrowUpRight, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function ClassCard({ room }) {
  const teacher = room.role === 'teacher'
  return <Link to={`/classes/${room.id}`} className="card group flex min-h-56 flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift">
    <div className="h-1.5 bg-brand-600" />
    <div className="flex flex-1 flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-700"><BookOpen size={19} /></span>
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize ${teacher ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{room.role}</span>
      </div>
      <div className="mt-5 flex-1">
        <p className="eyebrow">{room.subject}</p>
        <h3 className="mt-1.5 text-lg font-bold tracking-tight text-slate-950">{room.name}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{room.description || 'No class description yet.'}</p>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-medium text-slate-500">
        <span>Class code <b className="ml-1 tracking-wide text-slate-700">{room.join_code}</b></span>
        <ArrowUpRight size={17} className="text-slate-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
      </div>
    </div>
  </Link>
}
