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
      <div className="h-28 bg-brand-900 sm:h-36" />
      <div className="px-5 pb-7 sm:px-8">
        <div className="-mt-12 flex flex-col justify-between gap-5 sm:-mt-14 sm:flex-row sm:items-end">
          <div className="flex min-w-0 items-end gap-4"><UserAvatar user={profile} size="lg" className="border-4 border-white shadow-card" /><div className="min-w-0 pb-1"><h1 className="truncate text-2xl font-bold tracking-tight text-slate-950">{profile.name}</h1><p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><Mail size={14} />{profile.email}</p></div></div>
          <Link to="/settings" className="btn-primary"><Pencil size={15} />Edit profile</Link>
        </div>
        <div className="mt-7 border-t border-slate-200 pt-6"><h2 className="text-sm font-bold text-slate-900">About</h2><p className={`mt-2 max-w-2xl text-sm leading-6 ${profile.bio ? 'text-slate-600' : 'italic text-slate-400'}`}>{profile.bio || 'No bio added yet.'}</p></div>
      </div>
    </section>

    <div className="mt-5 grid gap-4 sm:grid-cols-3">
      <StatCard icon={<BookOpen size={19} />} label="Teaching" value={profile.teaching_count} detail="Class memberships as teacher" />
      <StatCard icon={<GraduationCap size={19} />} label="Learning" value={profile.learning_count} detail="Class memberships as student" />
      <StatCard icon={<CalendarDays size={19} />} label="Member since" value={new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })} detail={new Date(profile.created_at).toLocaleDateString()} />
    </div>
  </div>
}

function StatCard({ icon, label, value, detail }) {
  return <div className="card p-5"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500">{icon}{label}</div><p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
}
