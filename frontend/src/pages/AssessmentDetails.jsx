import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BarChart3, Clock, FileQuestion, Play, ShieldCheck } from 'lucide-react'
import { errorMessage, getOnce } from '../api/axios'
import { AssessmentPageSkeleton } from '../components/LoadingSkeletons'

export default function AssessmentDetails() {
  const { assessmentId } = useParams()
  const navigate = useNavigate()
  const [assessment, setAssessment] = useState(null)
  const [role, setRole] = useState(null)
  const [unitId, setUnitId] = useState(null)
  const [error, setError] = useState('')
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let active = true
    getOnce(`/assessments/${assessmentId}`).then(async response => {
      if (!active) return
      setAssessment(response.data)
      const unit = await getOnce(`/units/${response.data.unit_id}`)
      const classroom = await getOnce(`/classrooms/${unit.data.classroom_id}`)
      if (!active) return
      setUnitId(unit.data.id)
      setRole(classroom.data.role)
    }).catch(err => {
      if (active) setError(errorMessage(err))
    })
    return () => { active = false }
  }, [assessmentId])

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!assessment || !role) return <AssessmentPageSkeleton />

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(unitId ? `/units/${unitId}` : '/dashboard')
  }

  const status = assessment.results_published ? 'Results published' : assessment.is_accepting_responses ? 'Open' : assessment.is_published ? 'Closed' : 'Draft'
  return <div className="mx-auto max-w-3xl"><button type="button" onClick={handleBack} className="back-link mb-4"><ArrowLeft size={16} />Back to unit</button><section className="card overflow-hidden"><div className="p-6 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase text-slate-600">{status}</span><span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck size={15} />Teacher-controlled evaluation</span></div><h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-950">{assessment.title}</h1><p className="mt-3 text-sm leading-6 text-slate-500">{assessment.description || 'Review the assessment details before continuing.'}</p><div className="mt-7 grid grid-cols-2 divide-x rounded-xl border border-slate-200 bg-slate-50"><div className="flex items-center gap-3 p-4"><Clock size={18} className="text-slate-500" /><div><p className="text-xs text-slate-500">Timing</p><p className="text-sm font-bold">{timingLabel(assessment)}</p></div></div><div className="flex items-center gap-3 p-4"><FileQuestion size={18} className="text-slate-500" /><div><p className="text-xs text-slate-500">Questions</p><p className="text-sm font-bold">{assessment.question_count}</p></div></div></div></div>
      <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 sm:px-8">
        {role === 'teacher' && <Link className="btn-primary" to={`/assessments/${assessment.id}/dashboard`}><BarChart3 size={16} />Assessment dashboard</Link>}
        {role === 'student' && <StudentAction assessment={assessment} now={now} />}
      </div>
    </section></div>
}

function StudentAction({ assessment, now }) {
  if (assessment.attempt_status === 'in_progress') return <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-sm text-slate-600">Your assessment is in progress.</p><Link className="btn-primary" to={`/assessments/${assessment.id}/attempt`}><Play size={16} />Continue assessment</Link></div>
  if (assessment.attempt_status) return <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-sm text-slate-600">Submission status: <b className="capitalize">{assessment.attempt_status.replaceAll('_', ' ')}</b></p><Link className="btn-primary" to={`/assessments/${assessment.id}/result`}>View status / result</Link></div>
  if (assessment.starts_at && serverDate(assessment.starts_at).getTime() > now) return <p className="text-sm font-semibold text-slate-500">This assessment opens {serverDate(assessment.starts_at).toLocaleString()}.</p>
  if (assessment.ends_at && serverDate(assessment.ends_at).getTime() <= now) return <p className="text-sm font-semibold text-red-600">The submission deadline has passed.</p>
  if (!assessment.is_accepting_responses) return <p className="text-sm font-semibold text-slate-500">This assessment is not currently accepting responses.</p>
  const action = ['timed', 'timed_deadline'].includes(assessment.timing_mode) ? 'Start timed assessment' : 'Begin assessment'
  return <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-xs text-slate-500">Your submission will remain pending until your teacher evaluates and publishes results.</p><Link className="btn-primary" to={`/assessments/${assessment.id}/attempt`}><Play size={16} />{action}</Link></div>
}

function timingLabel(assessment) {
  const due = assessment.ends_at ? `Due ${serverDate(assessment.ends_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : ''
  if (assessment.timing_mode === 'timed') return `${assessment.duration_minutes} min`
  if (assessment.timing_mode === 'deadline') return due || 'Deadline'
  if (assessment.timing_mode === 'timed_deadline') return `${assessment.duration_minutes} min${due ? ` · ${due}` : ''}`
  return 'No time limit'
}

function serverDate(value) {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}
