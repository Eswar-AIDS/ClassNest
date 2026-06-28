import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Code2, Edit3, Eye, FileUp, Plus, Send, Trash2 } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

export default function ClassCodespace() {
  const { classId, codespaceId } = useParams()
  const [room, setRoom] = useState(null)
  const [codespace, setCodespace] = useState(null)
  const [tasks, setTasks] = useState([])
  const [error, setError] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState('')
  const taskImportRef = useRef(null)
  const answerKeyImportRef = useRef(null)

  useEffect(() => {
    let active = true
    async function loadCodespace() {
      const codespaceResponse = codespaceId
        ? await api.get(`/codespaces/${codespaceId}`)
        : await api.get(`/classes/${classId}/codespace`)
      const taskResponse = await api.get(`/codespaces/${codespaceResponse.data.id}/tasks`)
      if (!active) return
      setRoom({
        id: codespaceResponse.data.classroom_id,
        name: codespaceResponse.data.classroom_name,
        role: codespaceResponse.data.role,
      })
      setCodespace(codespaceResponse.data)
      setTasks(taskResponse.data)
    }
    loadCodespace().catch(err => { if (active) setError(errorMessage(err)) })
    return () => { active = false }
  }, [classId, codespaceId])

  const teacher = room?.role === 'teacher'
  const publishTask = async task => {
    try {
      const { data } = await api.post(`/coding-tasks/${task.id}/publish`)
      setTasks(current => current.map(item => item.id === data.id ? data : item))
    } catch (err) { setError(errorMessage(err)) }
  }
  const deleteTask = async task => {
    if (!window.confirm(`Delete "${task.title}" and its submissions?`)) return
    try {
      await api.delete(`/coding-tasks/${task.id}`)
      setTasks(current => current.filter(item => item.id !== task.id))
    } catch (err) { setError(errorMessage(err)) }
  }
  const importExcel = async (file, endpoint, label) => {
    if (!file || !codespace) return
    setImporting(label)
    setError('')
    setImportResult(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const { data } = await api.post(`/codespaces/${codespace.id}/${endpoint}`, formData)
      const taskResponse = await api.get(`/codespaces/${codespace.id}/tasks`)
      setTasks(taskResponse.data)
      setImportResult({ label, ...data })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setImporting('')
      if (taskImportRef.current) taskImportRef.current.value = ''
      if (answerKeyImportRef.current) answerKeyImportRef.current.value = ''
    }
  }

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!room || !codespace) return <div className="card p-6 text-sm text-slate-500">Loading codespace...</div>

  const detailBase = `/codespaces/${codespace.id}`

  return <div>
    <Link className="back-link" to={codespaceId ? '/codespaces' : `/classes/${classId}`}><ArrowLeft size={16} />{codespaceId ? 'Back to codespaces' : 'Back to class'}</Link>
    <section className="mt-5 card p-6 sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <div className="eyebrow flex items-center gap-2"><Code2 size={16} />Codespace</div>
          <h1 className="mt-2 page-title">{codespace.name}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{codespace.description || 'Coding workspace for this class.'}</p>
        </div>
        {teacher && <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" disabled={!!importing} onClick={() => taskImportRef.current?.click()}><FileUp size={16} />{importing === 'Coding tasks' ? 'Importing...' : 'Bulk Import Tasks'}</button>
          <button type="button" className="btn-secondary" disabled={!!importing} onClick={() => answerKeyImportRef.current?.click()}><FileUp size={16} />{importing === 'Answer key' ? 'Importing...' : 'Bulk Import Answer Keys'}</button>
          <Link className="btn-primary" to={`${detailBase}/tasks/new`}><Plus size={16} />Create task</Link>
          <input ref={taskImportRef} type="file" accept=".xlsx" className="sr-only" onChange={event => importExcel(event.target.files?.[0], 'import-tasks', 'Coding tasks')} />
          <input ref={answerKeyImportRef} type="file" accept=".xlsx" className="sr-only" onChange={event => importExcel(event.target.files?.[0], 'import-answer-key', 'Answer key')} />
        </div>}
      </div>
    </section>

    {importResult && <section className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
      <p className="font-bold">{importResult.label} import complete</p>
      <p className="mt-1">Imported: {importResult.imported_count} · Updated: {importResult.updated_count} · Skipped: {importResult.skipped_count}</p>
      {!!importResult.errors?.length && <ul className="mt-2 list-disc space-y-1 pl-5">{importResult.errors.map((item, index) => <li key={index}>{item}</li>)}</ul>}
    </section>}

    <section className="mt-6 grid gap-3">
      {tasks.map(task => <article key={task.id} className="card p-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-950">{task.title}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${task.task_type === 'web' ? 'bg-cyan-50 text-cyan-700' : 'bg-violet-50 text-violet-700'}`}>{task.task_type === 'web' ? 'Web' : 'Python'}</span>
              <StatusBadge task={task} teacher={teacher} />
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{task.description || 'No description provided.'}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
              <span>{task.marks} marks</span>
              {teacher && <span className={task.answer_key_exists ? 'text-emerald-700' : 'text-amber-700'}>Answer key: {task.answer_key_exists ? 'Added' : 'Missing'}</span>}
              {task.due_at && <span>Due {serverDate(task.due_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
              {teacher && <span>{task.submission_count} submissions</span>}
            </div>
          </div>
          {teacher ? <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary" to={`${detailBase}/tasks/${task.id}/edit`}><Edit3 size={15} />Edit</Link>
            {!task.is_published && <button className="btn-secondary" onClick={() => publishTask(task)}><Send size={15} />Publish</button>}
            <Link className="btn-secondary" to={`${detailBase}/tasks/${task.id}/submissions`}><Eye size={15} />Submissions</Link>
            <button className="btn-secondary text-red-700 hover:border-red-200 hover:bg-red-50" onClick={() => deleteTask(task)}><Trash2 size={15} />Delete</button>
          </div> : <Link className="btn-primary" to={`${detailBase}/tasks/${task.id}/attempt`}>Open task</Link>}
        </div>
      </article>)}
      {!tasks.length && <div className="empty-state">{teacher ? 'Create the first coding task for this class.' : 'No coding tasks have been published yet.'}</div>}
    </section>
  </div>
}

function StatusBadge({ task, teacher }) {
  if (teacher) return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${task.is_published ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{task.is_published ? 'Published' : 'Draft'}</span>
  if (task.my_submission_status === 'evaluated') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-700"><CheckCircle2 size={13} />Evaluated</span>
  if (task.my_submission_status) return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase text-blue-700">Submitted</span>
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase text-slate-600">Not submitted</span>
}

function serverDate(value) {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}
