import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Eye, EyeOff, FileQuestion, Play, Plus, ShieldCheck } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

export default function TestDetails() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const [test, setTest] = useState(null)
  const [room, setRoom] = useState(null)
  const [error, setError] = useState('')

  const load = () => api.get(`/tests/${testId}`).then(async response => {
    setTest(response.data)
    const unit = await api.get(`/units/${response.data.unit_id}`)
    setRoom((await api.get(`/classrooms/${unit.data.classroom_id}`)).data)
  }).catch(err => setError(errorMessage(err)))

  useEffect(load, [testId])
  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!test || !room) return <div className="mx-auto h-72 max-w-3xl animate-pulse rounded-2xl bg-slate-200/60" />

  const teacher = room.role === 'teacher'
  const student = room.role === 'student'
  const toggle = async () => {
    await api.put(`/tests/${test.id}`, { title: test.title, description: test.description, duration_minutes: test.duration_minutes, is_published: !test.is_published })
    load()
  }

  return <div className="mx-auto max-w-3xl">
    <button onClick={() => navigate(-1)} className="back-link"><ArrowLeft size={16} />Back</button>
    <section className="card mt-6 overflow-hidden">
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${test.is_published ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-600'}`}>{test.is_published ? 'Published' : 'Draft'}</span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500"><ShieldCheck size={15} />Multiple choice assessment</span>
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-950">{test.title}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{test.description || 'Review the details below before beginning.'}</p>
        <div className="mt-7 grid grid-cols-2 divide-x rounded-xl border border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3 p-4"><Clock size={19} className="text-slate-500" /><div><p className="text-xs text-slate-500">Time allowed</p><p className="mt-0.5 text-sm font-bold text-slate-900">{test.duration_minutes} minutes</p></div></div>
          <div className="flex items-center gap-3 p-4"><FileQuestion size={19} className="text-slate-500" /><div><p className="text-xs text-slate-500">Questions</p><p className="mt-0.5 text-sm font-bold text-slate-900">{test.questions.length} total</p></div></div>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 sm:px-8">
        {teacher && <div className="flex flex-wrap gap-2"><Link className="btn-primary" to={`/tests/${test.id}/questions/new`}><Plus size={16} />Add questions</Link><button className="btn-secondary" onClick={toggle}>{test.is_published ? <EyeOff size={16} /> : <Eye size={16} />}{test.is_published ? 'Unpublish' : 'Publish test'}</button></div>}
        {student && <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-xs leading-5 text-slate-500">Your answers are graded after submission.</p><Link to={`/tests/${test.id}/attempt`} className="btn-primary"><Play size={16} />Begin test</Link></div>}
      </div>
    </section>
  </div>
}
