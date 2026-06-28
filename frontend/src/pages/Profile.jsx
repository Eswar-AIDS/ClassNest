import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CalendarDays, GraduationCap, Mail, Pencil } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import UserAvatar from '../components/UserAvatar'

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { api.get('/users/me').then(response => setProfile(response.data)).catch(err => setError(errorMessage(err))) }, [])

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!profile) return <div className="h-80 animate-pulse rounded-2xl bg-slate-200/60" />

  return <div className="mx-auto max-w-4xl">
    <section className="card overflow-hidden">
      <div className="h-36 bg-brand-900 sm:h-44" />
      <div className="px-5 pb-7 sm:px-9">
        <div className="relative flex flex-col gap-5 pt-16 text-center sm:flex-row sm:items-start sm:gap-5 sm:pt-8 sm:text-left">
          <UserAvatar user={profile} size="xl" className="mx-auto -mt-28 border-4 border-white shadow-[0_16px_40px_rgba(15,23,42,.18)] sm:mx-0 sm:-mt-20" />
          <div className="min-w-0 flex-1 sm:pt-1">
            <h1 className="truncate text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{profile.name}</h1>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-slate-500 sm:justify-start"><Mail size={14} />{profile.email}</p>
          </div>
          <Link to="/settings" className="btn-primary w-full justify-center sm:mt-1 sm:w-auto"><Pencil size={15} />Edit profile</Link>
        </div>
        <div className="mt-7 border-t border-slate-200 pt-6 sm:mt-8"><h2 className="text-sm font-bold text-slate-900">About</h2><p className={`mt-3 max-w-2xl text-sm leading-6 ${profile.bio ? 'text-slate-600' : 'italic text-slate-400'}`}>{profile.bio || 'No bio added yet.'}</p></div>
      </div>
    </section>

    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard icon={<BookOpen size={19} />} label="Teaching" value={profile.teaching_count} detail="Class memberships as teacher" />
      <StatCard icon={<GraduationCap size={19} />} label="Learning" value={profile.learning_count} detail="Class memberships as student" />
      <StatCard icon={<CalendarDays size={19} />} label="Member since" value={new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} detail={new Date(profile.created_at).toLocaleDateString()} />
    </div>
  </div>
}

function StatCard({ icon, label, value, detail }) {
  return <div className="card flex min-h-36 flex-col p-5 transition duration-200 hover:border-brand-100 hover:shadow-lift"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500">{icon}{label}</div><p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>
}
