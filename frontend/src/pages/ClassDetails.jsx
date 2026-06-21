import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BarChart3, Copy, Edit3, Link as LinkIcon, Mail, Plus, Settings2, Trash2, Users } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import UnitCard from '../components/UnitCard'

export default function ClassDetails() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [units, setUnits] = useState([])
  const [copied, setCopied] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    Promise.all([api.get(`/classrooms/${classId}`), api.get(`/classrooms/${classId}/units`)]).then(([classroomResponse, unitsResponse]) => {
      setRoom(classroomResponse.data)
      setUnits(unitsResponse.data)
    }).catch(err => setError(errorMessage(err)))
  }, [classId])

  if (!room) return <div className="h-72 animate-pulse rounded-2xl bg-slate-200/60" />

  const teacher = room.role === 'teacher'
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
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary" to={`/classes/${classId}/edit`}><Edit3 size={16} />Edit class</Link>
          <Link className="btn-secondary" to={`/classes/${classId}/members`}><Users size={16} />Members</Link>
          <Link className="btn-secondary" to={`/classes/${classId}/results`}><BarChart3 size={16} />Results</Link>
          <Link className="btn-secondary" to={`/classes/${classId}/notifications/email`}><Mail size={16} />Notify Students</Link>
          <Link className="btn-primary" to={`/classes/${classId}/units/new`}><Plus size={16} />New unit</Link>
          <button type="button" onClick={() => { setConfirmName(''); setConfirmDelete(true) }} className="btn-secondary text-red-700 hover:border-red-200 hover:bg-red-50"><Trash2 size={16} />Delete class</button>
        </div>
      </div>
    </section> : <div className="mt-5 flex justify-end"><Link className="btn-secondary" to={`/classes/${classId}/members`}><Users size={16} />View members</Link></div>}

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
        <div><h2 className="section-title">Course units</h2><p className="mt-1 text-sm text-slate-500">Work through the class content in order.</p></div>
        <span className="text-xs font-semibold text-slate-400">{units.length} {units.length === 1 ? 'unit' : 'units'}</span>
      </div>
      <div className="grid gap-3">
        {units.map(unit => <UnitCard key={unit.id} unit={unit} classId={classId} canEdit={teacher} onDelete={deleteUnit} />)}
        {!units.length && <div className="empty-state">{teacher ? 'Create the first unit to begin organizing this class.' : 'Your teacher has not published any units yet.'}</div>}
      </div>
    </section>
  </>
}
