import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BookOpen, Clock, Send } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import QuestionCard from '../components/QuestionCard'

export default function TestAttempt() {
  const { testId } = useParams()
  const navigate = useNavigate()
  const [test, setTest] = useState(null)
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.get(`/tests/${testId}`).then(response => setTest(response.data)).catch(err => setError(errorMessage(err))) }, [testId])

  const submit = async () => {
    if (!confirm('Submit your answers? You cannot edit this attempt afterward.')) return
    setBusy(true)
    try {
      const response = await api.post(`/tests/${testId}/submit`, { answers: Object.entries(answers).map(([question_id, selected_option]) => ({ question_id: Number(question_id), selected_option })) })
      navigate(`/results/${response.data.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  if (error) return <div className="mx-auto max-w-3xl p-4 sm:p-8"><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p></div>
  if (!test) return <div className="mx-auto h-72 max-w-3xl animate-pulse bg-slate-200/60" />

  const answered = Object.keys(answers).length
  const progress = test.questions.length ? answered / test.questions.length * 100 : 0

  return <>
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-white"><BookOpen size={17} /></span><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-950">{test.title}</p><p className="text-xs text-slate-500">Focused assessment</p></div></div>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-600"><Clock size={15} />{test.duration_minutes} min</span>
      </div>
      <div className="h-1 bg-slate-100"><div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} /></div>
    </header>

    <main className="mx-auto max-w-3xl px-4 py-7 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-end justify-between gap-4"><div><p className="eyebrow">Assessment</p><h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950">Answer every question</h1></div><p className="shrink-0 text-xs font-semibold text-slate-500">{answered} of {test.questions.length} answered</p></div>
      <div className="space-y-4">{test.questions.map((question, index) => <QuestionCard key={question.id} question={question} index={index} value={answers[question.id]} onChange={value => setAnswers({ ...answers, [question.id]: value })} />)}</div>
      <div className="sticky bottom-0 -mx-4 mt-7 border-t border-slate-200 bg-slate-100/95 px-4 py-4 backdrop-blur-xl sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-5">
        <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-slate-900">Ready to submit?</p><p className="hidden text-xs text-slate-500 sm:block">Review your choices before finishing.</p></div><button disabled={busy || !test.questions.length} onClick={submit} className="btn-primary"><Send size={15} />{busy ? 'Submitting…' : 'Submit test'}</button></div>
      </div>
    </main>
  </>
}
