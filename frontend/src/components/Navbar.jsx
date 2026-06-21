import { Menu } from 'lucide-react'
import ProfileDropdown from './ProfileDropdown'

export default function Navbar({ onMenu }) {
  return <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6 md:px-8">
    <div className="flex items-center gap-3">
      <button aria-label="Open navigation" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" onClick={onMenu}><Menu size={21} /></button>
      <p className="hidden text-sm font-medium text-slate-500 sm:block">Classroom workspace</p>
    </div>
    <ProfileDropdown />
  </header>
}
