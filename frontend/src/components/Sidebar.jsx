import { BookOpen, LayoutDashboard, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export default function Sidebar({ open, onClose }) {
  return <>
    <button aria-label="Close navigation" onClick={onClose} className={`${open ? 'block' : 'hidden'} fixed inset-0 z-30 bg-slate-950/35 backdrop-blur-[1px] md:hidden`} />
    <aside className={`${open ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-slate-200 bg-white transition-transform duration-200 md:translate-x-0`}>
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
        <div className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-950">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white shadow-sm"><BookOpen size={18} /></span>
          ClassNest
        </div>
        <button aria-label="Close navigation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden" onClick={onClose}><X size={20} /></button>
      </div>
      <nav className="flex-1 p-3">
        <p className="px-3 pb-2 pt-3 text-[11px] font-bold uppercase tracking-[.13em] text-slate-400">Workspace</p>
        <NavLink to="/" end onClick={onClose} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
          <LayoutDashboard size={18} />Dashboard
        </NavLink>
      </nav>
      <div className="m-4 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
        <p className="font-semibold text-slate-700">Roles follow the classroom.</p>
        <p className="mt-1">Teach one class and learn in another.</p>
      </div>
    </aside>
  </>
}
