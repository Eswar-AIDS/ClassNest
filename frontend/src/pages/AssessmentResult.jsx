import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleMinus, Clock3, XCircle } from 'lucide-react'
import { errorMessage, getOnce } from '../api/axios'
import { PageSkeleton } from '../components/common/Loading'

function studentAnswer(response) {
  return response.selected_option || response.text_answer || response.code_answer || ''
}

function responseStatus(response) {
  const answer = studentAnswer(response).trim()
  if (!answer) return 'not_answered'
  if (response.is_correct === true) return 'correct'
  if (response.is_correct === false) return 'incorrect'
  if (response.awarded_marks > 0 && response.awarded_marks < response.max_marks) return 'partial'
  if (response.question_type === 'CODING' && response.awarded_marks != null) return 'reviewed'
  return 'reviewed'
}

function statusConfig(status) {
  return {
    correct: {
      label: 'Correct',
      icon: CheckCircle2,
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      card: 'border-emerald-200',
      answerBox: 'border border-emerald-200 bg-emerald-50 text-emerald-900',
    },
    incorrect: {
      label: 'Incorrect',
      icon: XCircle,
      badge: 'border-red-200 bg-red-50 text-red-700',
      card: 'border-red-200',
      answerBox: 'border border-red-200 bg-red-50 text-red-900',
    },
    partial: {
      label: 'Partially Correct',
      icon: AlertTriangle,
      badge: 'border-amber-200 bg-amber-50 text-amber-800',
      card: 'border-amber-200',
      answerBox: 'border border-amber-200 bg-amber-50 text-amber-900',
    },
    reviewed: {
      label: 'Reviewed',
      icon: AlertTriangle,
      badge: 'border-amber-200 bg-amber-50 text-amber-800',
      card: 'border-amber-200',
      answerBox: 'border border-amber-200 bg-amber-50 text-amber-900',
    },
    not_answered: {
      label: 'Not Answered',
      icon: CircleMinus,
      badge: 'border-slate-200 bg-slate-100 text-slate-600',
      card: 'border-slate-200',
      answerBox: 'border border-slate-200 bg-slate-50 text-slate-500',
    },
  }[status]
}

function SummaryStat({ label, value, tone = 'slate' }) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  }
  return <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
    <p className="text-xs font-bold uppercase tracking-wide opacity-75">{label}</p>
    <p className="mt-1 text-2xl font-bold">{value}</p>
  </div>
}

function ResponseCard({ response, index }) {
  const status = responseStatus(response)
  const config = statusConfig(status)
  const Icon = config.icon
  const answer = studentAnswer(response) || 'No answer submitted'
  const correctAnswer = response.correct_answer || response.accepted_answers || 'Teacher reviewed'
  const feedback = response.feedback || response.explanation || ''

  return <article className={`card p-5 ${config.card}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Question {index + 1} · {response.question_type}</p>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${config.badge}`}>
          <Icon size={14} />{config.label}
        </span>
      </div>
      <p className="text-sm font-bold text-slate-900">{response.awarded_marks}/{response.max_marks} marks</p>
    </div>

    <h3 className="mt-3 font-semibold leading-7 text-slate-950">{response.question_text}</h3>
    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div className={`rounded-lg p-3 ${config.answerBox}`}>
        <p className="text-xs font-bold uppercase opacity-70">Your answer</p>
        <pre className="mt-1 whitespace-pre-wrap font-sans font-semibold">{answer}</pre>
      </div>
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
        <p className="text-xs font-bold uppercase text-emerald-700">Correct / accepted answer</p>
        <pre className="mt-1 whitespace-pre-wrap font-sans font-semibold">{correctAnswer}</pre>
      </div>
    </div>
    {feedback && <p className="mt-3 text-sm leading-6 text-slate-600"><b>Feedback:</b> {feedback}</p>}
  </article>
}

export default function AssessmentResult() {
  const { assessmentId } = useParams()
  const [result, setResult] = useState(null)
  const [pending, setPending] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getOnce(`/assessments/${assessmentId}/my-result`)
      .then(response => {
        if (response.data.status === 'published') setResult(response.data)
        else setPending(response.data)
      })
      .catch(err => {
        if (err.response?.status === 409) setPending({ status: 'evaluated_not_published', message: 'Your result is not published yet.' })
        else setError(errorMessage(err))
      })
  }, [assessmentId])

  if (pending) {
    const labels = {
      not_attempted: 'Not Attempted',
      pending_evaluation: 'Pending Evaluation',
      evaluated_not_published: 'Evaluated — Not Published',
    }
    return <div className="mx-auto max-w-xl py-12"><div className="card p-8 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-amber-50 text-amber-700"><Clock3 size={27} /></span><h1 className="mt-5 text-2xl font-bold">Your result is not published yet</h1><p className="mt-2 font-semibold text-amber-700">Status: {labels[pending.status] || pending.status.replaceAll('_', ' ')}</p><p className="mt-3 text-sm leading-6 text-slate-500">{pending.message}</p><Link to="/dashboard" className="btn-primary mt-6">Return to classes</Link></div></div>
  }

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!result) return <PageSkeleton cards={4} />

  const percentage = result.total_marks ? Math.round(result.score / result.total_marks * 100) : 0
  const counts = result.responses.reduce((summary, response) => {
    const status = responseStatus(response)
    if (status === 'partial' || status === 'reviewed') summary.reviewed += 1
    else summary[status] += 1
    return summary
  }, { correct: 0, incorrect: 0, reviewed: 0, not_answered: 0 })

  return <div className="mx-auto max-w-4xl">
    <Link to="/dashboard" className="back-link"><ArrowLeft size={16} />My classes</Link>
    <section className="card mt-6 p-7 sm:p-8">
      <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-700"><CheckCircle2 size={16} />Results published</div>
          <h1 className="mt-3 text-2xl font-bold">{result.assessment_title}</h1>
          <p className="mt-2 text-sm text-slate-500">Score: {result.score} / {result.total_marks}</p>
        </div>
        <div className="text-4xl font-bold text-brand-900">{percentage}%</div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <SummaryStat label="Correct" value={counts.correct} tone="emerald" />
        <SummaryStat label="Incorrect" value={counts.incorrect} tone="red" />
        <SummaryStat label="Reviewed" value={counts.reviewed} tone="amber" />
        <SummaryStat label="Not answered" value={counts.not_answered} />
      </div>
    </section>
    <section className="mt-8">
      <h2 className="section-title">Response review</h2>
      <div className="mt-4 space-y-3">{result.responses.map((response, index) => <ResponseCard key={response.question_id} response={response} index={index} />)}</div>
    </section>
  </div>
}
