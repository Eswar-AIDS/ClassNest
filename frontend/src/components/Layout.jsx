import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'

export default function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const focusMode = /^\/(tests|assessments)\/[^/]+\/attempt$/.test(location.pathname)

  if (focusMode) {
    return <main className="min-h-screen bg-slate-100/70"><Outlet /></main>
  }

  return <div className="min-h-screen">
    <Sidebar open={open} onClose={() => setOpen(false)} />
    <div className="md:pl-60">
      <Navbar onMenu={() => setOpen(true)} />
      <main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 md:px-8 md:py-9">
        <Outlet />
      </main>
    </div>
  </div>
}
