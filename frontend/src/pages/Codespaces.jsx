import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Code2 } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

export default function Codespaces() {
  const [data, setData] = useState({ teaching: [], learning: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/codespaces').then(response => {
      if (!active) return
      setData(response.data)
    }).catch(err => {
      if (active) setError(errorMessage(err))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  return <div>
    <div className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end">
      <div>
        <p className="eyebrow">Codespaces</p>
        <h1 className="page-title mt-2">Codespaces</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Practice, assign, and review coding tasks across your classes.</p>
      </div>
    </div>
    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {loading ? <CodespacesSkeleton /> : <div className="mt-8 space-y-11">
      <CodespaceSection title="Teaching Codespaces" empty="You do not manage any codespaces yet." items={data.teaching} render={item => <TeachingCard key={item.codespace_id} item={item} />} />
      <CodespaceSection title="Learning Codespaces" empty="You have no coding tasks assigned yet." items={data.learning} render={item => <LearningCard key={item.codespace_id} item={item} />} />
    </div>}
  </div>
}

function CodespaceSection({ title, empty, items, render }) {
  return <section>
    <div className="mb-4 flex items-end justify-between gap-4">
      <div><h2 className="section-title">{title}</h2></div>
      <span className="shrink-0 text-xs font-semibold text-slate-400">{items.length} {items.length === 1 ? 'codespace' : 'codespaces'}</span>
    </div>
    {items.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(render)}</div> : <div className="empty-state">{empty}</div>}
  </section>
}

function TeachingCard({ item }) {
  return <article className="card p-5">
    <CardHeader item={item} role="Teacher" />
    <div className="mt-5 grid grid-cols-3 gap-2">
      <Stat label="Total tasks" value={item.total_tasks} />
      <Stat label="Published" value={item.published_tasks} />
      <Stat label="Pending" value={item.pending_submissions} />
    </div>
    <Link className="btn-primary mt-5 w-full" to={`/codespaces/${item.codespace_id}`}>Open Codespace<ArrowRight size={16} /></Link>
  </article>
}

function LearningCard({ item }) {
  return <article className="card p-5">
    <CardHeader item={item} role="Student" />
    <div className="mt-5 grid grid-cols-3 gap-2">
      <Stat label="Available" value={item.available_tasks} />
      <Stat label="Submitted" value={item.submitted_tasks} />
      <Stat label="Feedback" value={item.pending_feedback} />
    </div>
    <Link className="btn-primary mt-5 w-full" to={`/codespaces/${item.codespace_id}`}>Open Codespace<ArrowRight size={16} /></Link>
  </article>
}

function CardHeader({ item, role }) {
  return <div className="flex items-start gap-3">
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700"><Code2 size={19} /></span>
    <div className="min-w-0">
      <h3 className="truncate font-bold text-slate-950">{item.codespace_name}</h3>
      <p className="mt-1 truncate text-sm text-slate-500">{item.class_name}</p>
      <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase text-slate-600">{role}</span>
    </div>
  </div>
}

function Stat({ label, value }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <p className="text-lg font-bold text-slate-950">{value}</p>
    <p className="mt-1 text-[11px] font-semibold uppercase text-slate-500">{label}</p>
  </div>
}

function CodespacesSkeleton() {
  return <div className="mt-8 space-y-11">
    {[0, 1].map(section => <section key={section}>
      <div className="mb-4 h-6 w-48 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map(item => <div key={item} className="card p-5">
          <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-slate-100" />
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[0, 1, 2].map(stat => <div key={stat} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        </div>)}
      </div>
    </section>)}
  </div>
}
