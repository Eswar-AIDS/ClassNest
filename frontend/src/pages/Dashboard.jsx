import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, Plus } from 'lucide-react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import ClassCard from '../components/ClassCard'

export default function Dashboard() {
  const [data, setData] = useState({ teaching: [], learning: [] })
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const notice = location.state?.notice || ''

  useEffect(() => {
    api.get('/classrooms').then(response => setData(response.data)).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!notice) return
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, navigate, notice])

  return <>
    <div className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end">
      <div>
        <p className="eyebrow">Dashboard</p>
        <h1 className="page-title mt-2">Welcome back, {user?.name?.split(' ')[0]}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Continue learning or manage the classes you teach.</p>
      </div>
      <div className="flex w-full gap-2 sm:w-auto">
        <Link className="btn-secondary flex-1 sm:flex-none" to="/classes/join"><LogIn size={16} />Join class</Link>
        <Link className="btn-primary flex-1 sm:flex-none" to="/classes/new"><Plus size={16} />Create class</Link>
      </div>
    </div>
    {notice && <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}
    {loading ? <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map(item => <div key={item} className="h-56 animate-pulse rounded-2xl bg-slate-200/60" />)}</div> : <div className="mt-8 space-y-11">
      <ClassSection title="Teaching" description="Classes where you are a teacher." rooms={data.teaching} empty="You aren't teaching any classes yet. Create a classroom to begin." />
      <ClassSection title="Learning" description="Classes where you are a student." rooms={data.learning} empty="You aren't learning in any classes yet. Join with a class code or invite link." />
    </div>}
  </>
}

function ClassSection({ title, description, rooms, empty }) {
  return <section>
    <div className="mb-4 flex items-end justify-between gap-4">
      <div><h2 className="section-title">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>
      <span className="shrink-0 text-xs font-semibold text-slate-400">{rooms.length} {rooms.length === 1 ? 'class' : 'classes'}</span>
    </div>
    {rooms.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{rooms.map(room => <ClassCard key={room.id} room={room} />)}</div> : <div className="empty-state">{empty}</div>}
  </section>
}
