import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, LogOut, Settings, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import UserAvatar from './UserAvatar'

export default function ProfileDropdown() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const container = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const closeOutside = event => {
      if (!container.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const signOut = () => {
    logout()
    setOpen(false)
    navigate('/login', { replace: true })
  }

  return <div ref={container} className="relative">
    <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)} className="flex items-center gap-2 rounded-xl p-1.5 text-left transition hover:bg-slate-100 focus:ring-4 focus:ring-slate-100 sm:gap-3">
      <div className="hidden max-w-52 text-right sm:block"><p className="truncate text-sm font-semibold leading-5 text-slate-900">{user?.name}</p><p className="truncate text-xs text-slate-500">{user?.email}</p></div>
      <UserAvatar user={user} size="sm" />
      <ChevronDown size={15} className={`hidden text-slate-400 transition sm:block ${open ? 'rotate-180' : ''}`} />
    </button>

    {open && <div role="menu" className="absolute right-0 top-[calc(100%+.55rem)] z-50 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lift">
      <div className="border-b border-slate-100 p-4 sm:hidden"><p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{user?.email}</p></div>
      <div className="p-1.5">
        <MenuLink to="/profile" icon={<UserRound size={17} />} onClick={() => setOpen(false)}>View Profile</MenuLink>
        <MenuLink to="/settings" icon={<Settings size={17} />} onClick={() => setOpen(false)}>Account Settings</MenuLink>
        <MenuLink to="/dashboard" icon={<BookOpen size={17} />} onClick={() => setOpen(false)}>My Classes</MenuLink>
      </div>
      <div className="border-t border-slate-100 p-1.5"><button role="menuitem" type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"><LogOut size={17} />Logout</button></div>
    </div>}
  </div>
}

function MenuLink({ to, icon, onClick, children }) {
  return <Link role="menuitem" to={to} onClick={onClick} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950">{icon}{children}</Link>
}
