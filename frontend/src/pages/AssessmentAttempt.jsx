import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { BookOpen, CheckCircle2, Clock, LoaderCircle, Play, RotateCcw, Save, Send, Terminal, XCircle } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

export default function AssessmentAttempt() {
  const { assessmentId } = useParams()
  const navigate = useNavigate()
  const [assessment, setAssessment] = useState(null)
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    api.get(`/assessments/${assessmentId}`).then(response => {
      setAssessment(response.data)
      setAnswers(Object.fromEntries(response.data.questions.filter(question => question.question_type === 'CODING' && question.starter_code).map(question => [question.id, question.starter_code])))
    }).catch(err => setError(errorMessage(err)))
  }, [assessmentId])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const start = async () => {
    if (['timed', 'timed_deadline'].includes(assessment.timing_mode) && !confirm('Once you start, your timer will begin. Continue?')) return
    setBusy(true); setError('')
    try {
      const response = await api.post(`/assessments/${assessmentId}/start-attempt`)
      setAssessment(response.data)
      setBusy(false)
    } catch (err) { setError(errorMessage(err)); setBusy(false) }
  }

  const submit = async () => {
    if (!confirm('Submit your assessment? You can submit only once.')) return
    setBusy(true)
    try {
      await api.post(`/assessments/${assessmentId}/submit`, { responses: assessment.questions.map(question => ({ question_id: question.id, ...(question.question_type === 'MCQ' ? { selected_option: answers[question.id] || null } : question.question_type === 'FILLUP' ? { text_answer: answers[question.id] || '' } : { code_answer: answers[question.id] || '' }) })) })
      navigate(`/assessments/${assessmentId}/result`, { replace: true })
    } catch (err) {
      setError(errorMessage(err)); setBusy(false)
    }
  }

  if (error) return <div className="mx-auto max-w-3xl p-6"><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p></div>
  if (!assessment) return <div className="mx-auto h-72 max-w-3xl animate-pulse bg-slate-200/60" />
  const needsStart = ['timed', 'timed_deadline'].includes(assessment.timing_mode) && !assessment.attempt_started_at
  const deadline = assessment.attempt_expires_at || (['deadline'].includes(assessment.timing_mode) ? assessment.ends_at : null)
  const remainingMs = deadline ? serverDate(deadline).getTime() - now : null
  const expired = remainingMs != null && remainingMs <= 0
  if (needsStart) return <div className="mx-auto max-w-xl py-12"><div className="card p-8 text-center"><span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-50 text-brand-700"><Clock size={27} /></span><h1 className="mt-5 text-2xl font-bold">Ready to start?</h1><p className="mt-3 text-sm leading-6 text-slate-500">This assessment has a {assessment.duration_minutes} minute timer. Once you start, your timer will begin.</p><button disabled={busy} onClick={start} className="btn-primary mt-6">{busy ? 'Starting…' : 'Start Assessment'}</button></div></div>
  const answered = assessment.questions.filter(question => (answers[question.id] || '').trim()).length
  const progress = assessment.question_count ? answered / assessment.question_count * 100 : 0

  return <><header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xl"><div className="mx-auto flex min-h-16 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white"><BookOpen size={17} /></span><div className="min-w-0"><p className="truncate text-sm font-bold">{assessment.title}</p><p className="text-xs text-slate-500">MCQ · Fill-up · Coding</p></div></div><TimingBadge assessment={assessment} remainingMs={remainingMs} /></div><div className="h-1 bg-slate-100"><div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} /></div></header>
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{expired && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">Assessment time has expired. Submissions may be rejected.</p>}<div className="mb-6 flex justify-between gap-4"><div><p className="eyebrow">Assessment</p><h1 className="mt-1 text-2xl font-bold">Answer every question</h1></div><p className="text-xs font-semibold text-slate-500">{answered}/{assessment.question_count} answered</p></div><div className="space-y-4">{assessment.questions.map((question, index) => <AssessmentQuestion key={question.id} question={question} index={index} value={answers[question.id] || ''} onChange={value => setAnswers({ ...answers, [question.id]: value })} />)}</div><div className="sticky bottom-0 -mx-4 mt-7 border-t border-slate-200 bg-slate-100/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-white"><div className="flex items-center justify-between gap-4"><p className="text-xs text-slate-500">Results appear only after teacher evaluation and publication.</p><button disabled={busy || !assessment.question_count || expired} onClick={submit} className="btn-primary"><Send size={15} />{busy ? 'Submitting…' : 'Submit'}</button></div></div></main></>
}

function TimingBadge({ assessment, remainingMs }) {
  if (remainingMs != null) {
    const total = Math.max(0, Math.floor(remainingMs / 1000))
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    const urgent = total <= 300
    return <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${urgent ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}><Clock size={15} />{minutes}:{String(seconds).padStart(2, '0')}</span>
  }
  if (assessment.ends_at) return <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Clock size={15} />Due {serverDate(assessment.ends_at).toLocaleString()}</span>
  return <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Clock size={15} />No time limit</span>
}

function serverDate(value) {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}

function AssessmentQuestion({ question, index, value, onChange }) {
  return <section className="card p-5 sm:p-7"><div className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span><div><span className="text-[10px] font-bold uppercase tracking-wide text-brand-700">{question.question_type} · {question.marks} marks</span><h2 className="mt-1 font-semibold leading-6 text-slate-900">{question.question_text}</h2></div></div><div className="mt-5 pl-0 sm:pl-10">
    {question.question_type === 'MCQ' && <div className="space-y-2">{['A', 'B', 'C', 'D'].map(option => <label key={option} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${value === option ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}><input type="radio" name={`assessment-${question.id}`} checked={value === option} onChange={() => onChange(option)} /><b>{option}</b><span>{question[`option_${option.toLowerCase()}`]}</span></label>)}</div>}
    {question.question_type === 'FILLUP' && <input className="field" placeholder="Type your answer" value={value} onChange={event => onChange(event.target.value)} />}
    {question.question_type === 'CODING' && <CodingAnswer question={question} value={value} onChange={onChange} />}
  </div></section>
}

function CodingAnswer({ question, value, onChange }) {
  const [result, setResult] = useState(null)
  const [runError, setRunError] = useState('')
  const [running, setRunning] = useState(false)
  const [saved, setSaved] = useState(false)
  const starterCode = question.starter_code || ''

  const updateCode = code => {
    onChange(code || '')
    setSaved(false)
  }
  const runCode = async () => {
    setRunning(true); setRunError(''); setResult(null)
    try {
      const response = await api.post('/coding/run', { question_id: question.id, code: value, language: 'python' })
      setResult(response.data)
    } catch (err) { setRunError(errorMessage(err)) } finally { setRunning(false) }
  }
  const reset = () => {
    updateCode(starterCode)
    setResult(null); setRunError('')
  }
  const save = () => {
    onChange(value)
    setSaved(true)
  }

  return <div>
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Python editor</span><span className="text-[11px] text-slate-400">4 spaces · line numbers</span></div>
      <Editor height="300px" language="python" theme="vs" value={value} onChange={updateCode} loading={<div className="grid h-[300px] place-items-center text-sm text-slate-500">Loading editor…</div>} options={{
        automaticLayout: true, lineNumbers: 'on', minimap: { enabled: false },
        insertSpaces: true, tabSize: 4, detectIndentation: false,
        autoClosingBrackets: 'always', autoClosingQuotes: 'always',
        scrollBeyondLastLine: false, wordWrap: 'on', fontSize: 14,
        padding: { top: 14, bottom: 14 }, formatOnPaste: true,
      }} />
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={running || !value.trim()} onClick={runCode} className="btn-primary"><Play size={15} />{running ? 'Running…' : 'Run Code'}</button><button type="button" disabled={running} onClick={reset} className="btn-secondary"><RotateCcw size={15} />Reset to Starter Code</button><button type="button" onClick={save} className="btn-secondary"><Save size={15} />Save Answer / Continue</button>{saved && <span className="text-xs font-semibold text-emerald-700">Saved for submission</span>}</div>
    {question.visible_test_cases && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Visible test cases</p><pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-6 text-slate-700">{question.visible_test_cases}</pre></div>}
    {(running || runError || result) && <CodeOutput running={running} error={runError} result={result} />}
  </div>
}

function CodeOutput({ running, error, result }) {
  const message = result?.error_type === 'IndentationError' ? 'IndentationError: check spaces/tabs and block indentation.' : result?.stderr
  return <section className="mt-4 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-100"><header className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-300"><Terminal size={15} />Output</span>{result && <span className="text-[11px] text-slate-500">{result.execution_time_ms} ms</span>}</header><div className="space-y-4 p-4">
    {running && <p className="flex items-center gap-2 text-sm text-slate-300"><LoaderCircle size={16} className="animate-spin" />Running visible tests…</p>}
    {error && <p className="whitespace-pre-wrap text-sm text-red-300">{error}</p>}
    {message && <pre className="whitespace-pre-wrap rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs leading-6 text-red-200">{message}</pre>}
    {result?.stdout && <div><p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Standard output</p><pre className="whitespace-pre-wrap text-xs leading-6 text-slate-200">{result.stdout}</pre></div>}
    {result && !result.stderr && !result.stdout && !result.test_case_results.length && <p className="text-sm text-emerald-300">Code ran without output.</p>}
    {result?.test_case_results.length > 0 && <div className="space-y-2">{result.test_case_results.map(test => <div key={test.index} className={`rounded-lg border p-3 ${test.passed ? 'border-emerald-900 bg-emerald-950/30' : 'border-red-900 bg-red-950/30'}`}><div className="flex items-center gap-2 text-xs font-bold">{test.passed ? <CheckCircle2 size={15} className="text-emerald-400" /> : <XCircle size={15} className="text-red-400" />}Visible test {test.index}: {test.passed ? 'Passed' : 'Failed'}</div><div className="mt-2 grid gap-2 text-xs sm:grid-cols-3"><p><span className="text-slate-500">Input</span><br /><code>{test.input}</code></p><p><span className="text-slate-500">Expected</span><br /><code>{test.expected}</code></p><p><span className="text-slate-500">Actual</span><br /><code>{test.actual ?? 'No result'}</code></p></div>{test.error && <p className="mt-2 text-xs text-red-300">{test.error}</p>}</div>)}</div>}
  </div></section>
}
