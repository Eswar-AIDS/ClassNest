import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BarChart3, ChevronDown, Code2, Copy, Edit3, Link as LinkIcon, Mail, Plus, Settings2, Trash2, Users } from 'lucide-react'
import api, { cacheKeys, errorMessage, getOnce, removeSessionCache } from '../api/axios'
import UnitCard from '../components/UnitCard'
import { ClassPageSkeleton } from '../components/LoadingSkeletons'
import useClassActivity from '../hooks/useClassActivity'

export default function ClassDetails() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [codespace, setCodespace] = useState(null)
  const [units, setUnits] = useState([])
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [contentView, setContentView] = useState('units')
  const [activeUsers, setActiveUsers] = useState([])
  const [activeUsersLoading, setActiveUsersLoading] = useState(false)
  const toolsRef = useRef(null)

  useEffect(() => {
    let active = true
    Promise.all([getOnce(`/classrooms/${classId}`), getOnce(`/classrooms/${classId}/units`), getOnce(`/classes/${classId}/codespace`)]).then(([classroomResponse, unitsResponse, codespaceResponse]) => {
      if (!active) return
      setRoom(classroomResponse.data)
      setUnits(unitsResponse.data)
      setCodespace(codespaceResponse.data)
    }).catch(err => {
      if (active) setError(errorMessage(err))
    })
    return () => { active = false }
  }, [classId])

  useClassActivity(classId, room ? {
    activity_type: 'class_view',
    activity_label: room.name,
    entity_type: 'classroom',
    entity_id: Number(classId),
  } : null)

  useEffect(() => {
    if (!toolsOpen) return undefined
    const closeTools = event => {
      if (!toolsRef.current?.contains(event.target)) setToolsOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key === 'Escape') setToolsOpen(false)
    }
    document.addEventListener('mousedown', closeTools)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeTools)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [toolsOpen])

  useEffect(() => {
    if (!room || room.role !== 'teacher' || contentView !== 'active') return undefined
    let active = true
    let timer
    const loadActiveUsers = async (showLoading = false) => {
      if (showLoading) setActiveUsersLoading(true)
      try {
        const { data } = await api.get(`/classes/${classId}/active-users`)
        if (active) setActiveUsers(data)
      } catch (err) {
        if (active) setError(errorMessage(err))
      } finally {
        if (active) setActiveUsersLoading(false)
      }
    }
    loadActiveUsers(true)
    timer = setInterval(() => loadActiveUsers(false), 20000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [classId, contentView, room])

  if (!room) return <ClassPageSkeleton />

  const teacher = room.role === 'teacher'
  const codespacePath = codespace ? `/codespaces/${codespace.id}` : `/classes/${classId}/codespace`
  const inviteUrl = `${window.location.origin}/join/${room.join_code}`
  const copy = async (value, type) => {
    await navigator.clipboard.writeText(value)
    setCopied(type)
    setTimeout(() => setCopied(''), 1600)
  }
  const deleteUnit = async unit => {
    if (!window.confirm('Delete this unit? Its materials, attachments, assessments, questions, and submissions will also be permanently deleted.')) return
    try {
      await api.delete(`/units/${unit.id}`)
      setUnits(current => current.filter(item => item.id !== unit.id))
    } catch (err) { setError(errorMessage(err)) }
  }
  const deleteClassroom = async () => {
    if (confirmName !== room.name) return
    setDeleting(true)
    setError('')
    try {
      const { data } = await api.delete(`/classrooms/${classId}`)
      removeSessionCache(cacheKeys.dashboardClasses)
      navigate('/dashboard', {
        replace: true,
        state: {
          notice: data.archived
            ? 'Classroom archived because it contains submissions/results.'
            : 'Classroom deleted successfully.',
        },
      })
    } catch (err) {
      setError(errorMessage(err))
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return <>
    <section className="overflow-hidden rounded-2xl border border-brand-900/10 bg-brand-900 text-white shadow-card">
      <div className="p-6 sm:p-8 md:p-10">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-blue-200"><span>{room.subject}</span><span className="text-white/30">•</span><span className="capitalize">{room.role}</span></div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{room.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/80 sm:text-base">{room.description || 'Welcome to your classroom.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => copy(room.join_code, 'code')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3.5 text-sm font-semibold hover:bg-white/15">
              <Copy size={16} /><span>{copied === 'code' ? 'Code copied' : room.join_code}</span>
            </button>
            <button onClick={() => copy(inviteUrl, 'link')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3.5 text-sm font-semibold hover:bg-white/15">
              <LinkIcon size={16} /><span>{copied === 'link' ? 'Link copied' : 'Copy invite link'}</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    {teacher ? <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Settings2 size={17} /></span>
          <div><h2 className="text-sm font-bold text-slate-900">Teacher management</h2><p className="mt-0.5 text-xs leading-5 text-slate-500">Add course content, manage learners, and review performance.</p></div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Link className="btn-primary" to={`/classes/${classId}/units/new`}><Plus size={16} />New unit</Link>
          <div className="relative" ref={toolsRef}>
            <button type="button" aria-haspopup="menu" aria-expanded={toolsOpen} onClick={() => setToolsOpen(current => !current)} className="btn-secondary">
              <Settings2 size={16} />Teacher tools<ChevronDown size={15} />
            </button>
            {toolsOpen && <div role="menu" className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-lift">
              <ToolLink to={`/classes/${classId}/edit`} icon={<Edit3 size={16} />} onClick={() => setToolsOpen(false)}>Edit class</ToolLink>
              <ToolLink to={`/classes/${classId}/members`} icon={<Users size={16} />} onClick={() => setToolsOpen(false)}>Members</ToolLink>
              <ToolLink to={`/classes/${classId}/results`} icon={<BarChart3 size={16} />} onClick={() => setToolsOpen(false)}>Results</ToolLink>
              <ToolLink to={codespacePath} icon={<Code2 size={16} />} onClick={() => setToolsOpen(false)}>Codespace</ToolLink>
              <ToolLink to={`/classes/${classId}/notifications/email`} icon={<Mail size={16} />} onClick={() => setToolsOpen(false)}>Notify Students</ToolLink>
              <div className="my-2 border-t border-slate-200" />
              <button type="button" role="menuitem" onClick={() => { setToolsOpen(false); setConfirmName(''); setConfirmDelete(true) }} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 size={16} />Delete class</button>
            </div>}
          </div>
        </div>
      </div>
    </section> : <div className="mt-5 flex justify-end gap-2"><Link className="btn-secondary" to={codespacePath}><Code2 size={16} />Codespace</Link><Link className="btn-secondary" to={`/classes/${classId}/members`}><Users size={16} />View members</Link></div>}

    {confirmDelete && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-lift">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-700"><Trash2 size={19} /></span>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Delete classroom?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">This will delete the classroom and all units, materials, assessments, and members. If submissions exist, the class will be archived instead to preserve results. Continue?</p>
          </div>
        </div>
        <label className="mt-5 block">
          <span className="label">Type “{room.name}” to confirm</span>
          <input className="field" value={confirmName} onChange={event => setConfirmName(event.target.value)} autoFocus />
        </label>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button type="button" className="btn-primary bg-red-600 hover:bg-red-700" disabled={deleting || confirmName !== room.name} onClick={deleteClassroom}>{deleting ? 'Deleting…' : 'Delete / Archive class'}</button>
        </div>
      </div>
    </div>}

    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="mt-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div><h2 className="section-title">{contentView === 'active' ? 'Active users' : 'Course units'}</h2><p className="mt-1 text-sm text-slate-500">{contentView === 'active' ? 'See what class members are viewing or working on.' : 'Work through the class content in order.'}</p></div>
        {teacher ? <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          <button type="button" onClick={() => setContentView('units')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${contentView === 'units' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Units</button>
          <button type="button" onClick={() => setContentView('active')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${contentView === 'active' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>Active users</button>
        </div> : <span className="text-xs font-semibold text-slate-400">{units.length} {units.length === 1 ? 'unit' : 'units'}</span>}
      </div>
      {contentView === 'units' ? <div className="grid gap-3">
        {units.map(unit => <UnitCard key={unit.id} unit={unit} classId={classId} canEdit={teacher} onDelete={deleteUnit} />)}
        {!units.length && <div className="empty-state">{teacher ? 'Create the first unit to begin organizing this class.' : 'Your teacher has not published any units yet.'}</div>}
      </div> : <ActiveUsersPanel users={activeUsers} loading={activeUsersLoading} />}
    </section>
  </>
}

function ToolLink({ to, icon, onClick, children }) {
  return <Link role="menuitem" className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" to={to} onClick={onClick}>{icon}{children}</Link>
}

function ActiveUsersPanel({ users, loading }) {
  if (loading) return <div className="grid gap-2">{[0, 1, 2].map(item => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-bold uppercase text-slate-500">
          <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Current activity</th><th className="px-4 py-3">Viewing / working on</th><th className="px-4 py-3">Last active</th><th className="px-4 py-3">Status</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map(user => <tr key={user.user_id}>
            <td className="px-4 py-3 font-semibold text-slate-900">{user.name}</td>
            <td className="px-4 py-3 text-slate-500">{user.email}</td>
            <td className="px-4 py-3 text-slate-700">{activityLabel(user.activity_type)}</td>
            <td className="px-4 py-3 text-slate-500">{user.activity_label || user.route_path || 'Class activity'}</td>
            <td className="px-4 py-3 text-slate-500">{formatLastActive(user.last_active_at)}</td>
            <td className="px-4 py-3"><StatusBadge status={user.status} /></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {!users.length && <div className="empty-state m-4">No recent activity yet.</div>}
    <p className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">Activity updates are approximate and refresh every few seconds.</p>
  </div>
}

function StatusBadge({ status }) {
  const classes = {
    active: 'bg-emerald-50 text-emerald-700',
    recently_active: 'bg-amber-50 text-amber-700',
    offline: 'bg-slate-100 text-slate-600',
  }
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${classes[status] || classes.offline}`}>{status.replace('_', ' ')}</span>
}

function activityLabel(type) {
  return {
    material_view: 'Reading material',
    assessment_attempt: 'Working on assessment',
    assessment_view: 'Viewing assessment',
    codespace_task: 'Working in codespace',
    codespace_view: 'Viewing codespace',
    class_view: 'Viewing class',
    dashboard: 'Viewing dashboard',
    idle: 'Idle',
  }[type] || 'Class activity'
}

function formatLastActive(value) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}
