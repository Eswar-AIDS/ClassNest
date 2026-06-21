import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, CheckCircle2, X } from 'lucide-react'
import api from '../api/axios'

export default function TestResult() {
  const { attemptId } = useParams()
  const [result, setResult] = useState(null)

  useEffect(() => { api.get(`/results/attempts/${attemptId}`).then(response => setResult(response.data)) }, [attemptId])
  if (!result) return <div className="mx-auto h-72 max-w-4xl animate-pulse rounded-2xl bg-slate-200/60" />

  const percentage = result.total_marks ? Math.round(result.score / result.total_marks * 100) : 0
  const correct = result.answers.filter(answer => answer.is_correct).length
  const wrong = result.answers.length - correct

  return <div className="mx-auto max-w-4xl">
    <Link to="/" className="back-link"><ArrowLeft size={16} />Dashboard</Link>
    <section className="card mt-6 overflow-hidden">
      <div className="grid gap-7 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.13em] text-emerald-700"><CheckCircle2 size={16} />Assessment complete</div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{result.test_title}</h1>
          <p className="mt-2 text-sm text-slate-500">{result.student_name} · Submitted {new Date(result.submitted_at).toLocaleString()}</p>
          <div className="mt-6 flex flex-wrap gap-5 text-sm"><span><b className="text-slate-900">{correct}</b> <span className="text-slate-500">correct</span></span><span><b className="text-slate-900">{wrong}</b> <span className="text-slate-500">incorrect</span></span><span><b className="text-slate-900">{result.score}/{result.total_marks}</b> <span className="text-slate-500">marks</span></span></div>
        </div>
        <div className="flex size-32 flex-col items-center justify-center rounded-full border-[7px] border-brand-100 bg-brand-50 text-center sm:size-36"><span className="text-3xl font-bold tracking-tight text-brand-900">{percentage}%</span><span className="mt-1 text-[11px] font-bold uppercase tracking-wide text-brand-700">Score</span></div>
      </div>
    </section>

    <section className="mt-9">
      <div className="mb-4"><h2 className="section-title">Answer review</h2><p className="mt-1 text-sm text-slate-500">Compare your answers and read each explanation.</p></div>
      <div className="space-y-3">{result.answers.map((answer, index) => <article key={answer.question_id} className={`overflow-hidden rounded-2xl border bg-white shadow-card ${answer.is_correct ? 'border-emerald-200' : 'border-red-200'}`}>
        <div className="flex items-start gap-3 p-5 sm:p-6">
          <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${answer.is_correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{answer.is_correct ? <Check size={15} /> : <X size={15} />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Question {index + 1}</p>
            <h3 className="mt-1.5 font-semibold leading-6 text-slate-900">{answer.question}</h3>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div className="rounded-lg bg-slate-50 px-3.5 py-3"><p className="text-xs text-slate-500">Your answer</p><p className={`mt-1 font-bold ${answer.is_correct ? 'text-emerald-700' : 'text-red-700'}`}>{answer.selected_option || 'Not answered'}</p></div><div className="rounded-lg bg-emerald-50 px-3.5 py-3"><p className="text-xs text-emerald-700/70">Correct answer</p><p className="mt-1 font-bold text-emerald-800">{answer.correct_option}</p></div></div>
          </div>
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-600 sm:px-6"><b className="text-slate-900">Explanation:</b> {answer.explanation || 'No explanation provided.'}</div>
      </article>)}</div>
    </section>
  </div>
}
