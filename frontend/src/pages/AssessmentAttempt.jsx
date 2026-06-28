import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, BookOpen, CheckCircle2, Clock, Play, Send, ShieldCheck } from 'lucide-react'
import api, { apiBaseURL, errorMessage, getOnce } from '../api/axios'
import { AssessmentPageSkeleton } from '../components/common/Loading'

const PythonCodeWorkspace = lazy(() => import('../components/code/PythonCodeWorkspace'))

const BLOCKED_SHORTCUTS = new Set(['c', 'v', 'x', 't', 'n'])
const EVENT_MESSAGES = {
  assessment_started: 'Assessment started',
  assessment_submitted: 'Assessment submitted',
  auto_submitted_on_leave: 'Student left the assessment page. Attempt auto-submitted.',
  left_assessment_page: 'Student left the assessment page',
  fullscreen_enabled: 'Fullscreen enabled',
  fullscreen_failed: 'Fullscreen could not be enabled. Your activity will still be monitored.',
  fullscreen_exit: 'Fullscreen exited',
  tab_hidden: 'Tab hidden',
  window_blur: 'Window changed focus',
  returned_to_assessment: 'Returned to assessment',
  copy_attempt: 'Copy attempt recorded',
  paste_attempt: 'Paste attempt recorded',
  cut_attempt: 'Cut attempt recorded',
  right_click: 'Right click recorded',
  blocked_shortcut: 'Blocked keyboard shortcut recorded',
  before_unload: 'Student attempted to leave or reload the page',
}

export default function AssessmentAttempt() {
  const { assessmentId } = useParams()
  const navigate = useNavigate()
  const [assessment, setAssessment] = useState(null)
  const [answers, setAnswers] = useState({})
  const answersRef = useRef({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)
  const [warnings, setWarnings] = useState(0)
  const [toast, setToast] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const lastEventAtRef = useRef({})
  const savedPayloadRef = useRef('')
  const submittingRef = useRef(false)
  const hasSubmittedRef = useRef(false)
  const autoSubmittingRef = useRef(false)
  const autoSubmitArmedRef = useRef(false)
  const currentAttemptId = assessment?.attempt_id

  useEffect(() => {
    getOnce(`/assessments/${assessmentId}`).then(response => {
      setAssessment(response.data)
      const initialAnswers = Object.fromEntries(response.data.questions.filter(question => question.question_type === 'CODING' && question.starter_code).map(question => [question.id, question.starter_code]))
      setAnswers(initialAnswers)
      answersRef.current = initialAnswers
      setStarted(response.data.attempt_status === 'in_progress')
    }).catch(err => setError(errorMessage(err)))
  }, [assessmentId])

  useEffect(() => {
    if (!assessment || !isTimed(assessment)) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [assessment])

  const responsePayload = useCallback((source = answersRef.current) => ({
    responses: assessment.questions.map(question => ({
      question_id: question.id,
      ...(question.question_type === 'MCQ'
        ? { selected_option: source[question.id] || null }
        : question.question_type === 'FILLUP'
          ? { text_answer: source[question.id] || '' }
          : { code_answer: source[question.id] || '' }),
    })),
  }), [assessment])

  const fallbackPath = assessment?.unit_id ? `/units/${assessment.unit_id}` : '/dashboard'

  const saveDraft = useCallback(async (reason = 'autosave') => {
    if (!assessment || !started || submittingRef.current || autoSubmittingRef.current) return
    const payload = responsePayload()
    const serialized = JSON.stringify(payload)
    if (serialized === savedPayloadRef.current && reason !== 'before_unload') return
    try {
      await api.post(`/assessments/${assessmentId}/save-draft`, payload)
      savedPayloadRef.current = serialized
      setSaveStatus('Saved')
      setTimeout(() => setSaveStatus(''), 1400)
    } catch (err) {
      if (reason !== 'before_unload') setSaveStatus(errorMessage(err))
    }
  }, [assessment, assessmentId, responsePayload, started])

  const autoSubmitOnLeave = useCallback(async (reason = 'route_leave', navigateAfter = false) => {
    if (!assessment || !assessment.attempt_id || !started || submittingRef.current || hasSubmittedRef.current || autoSubmittingRef.current) return false
    autoSubmittingRef.current = true
    const payload = JSON.stringify({ ...responsePayload(), auto_submit_reason: reason })
    const url = `${apiBaseURL}/assessment-attempts/${assessment.attempt_id}/auto-submit`
    const token = localStorage.getItem('classnest_token')
    await fetch(url, {
      method: 'POST',
      body: payload,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      keepalive: true,
    }).catch(() => {
      // The browser may terminate this request during unload; the server still receives it when possible.
    }).finally(() => {
      hasSubmittedRef.current = true
      if (navigateAfter) navigate(fallbackPath, { replace: true })
    })
    return true
  }, [assessment, fallbackPath, navigate, responsePayload, started])

  const recordEvent = useCallback(async (eventType, metadata = {}, options = {}) => {
    const attemptId = options.attemptId || currentAttemptId
    if (!attemptId) return
    const nowMs = Date.now()
    const dedupeKey = `${eventType}:${metadata.shortcut || ''}`
    if (!options.force && nowMs - (lastEventAtRef.current[dedupeKey] || 0) < 1000) return
    lastEventAtRef.current[dedupeKey] = nowMs
    if (!['assessment_started', 'fullscreen_enabled'].includes(eventType)) {
      setWarnings(count => count + 1)
      setToast('Warning recorded: Tab switching/fullscreen exit/copy-paste is not allowed.')
      setTimeout(() => setToast(''), 3200)
    }
    try {
      await api.post(`/assessment-attempts/${attemptId}/events`, {
        event_type: eventType,
        event_message: EVENT_MESSAGES[eventType] || 'Assessment activity recorded',
        metadata,
      })
    } catch {
      // Monitoring should never interrupt the student.
    }
  }, [currentAttemptId])

  useEffect(() => {
    if (!started || !assessment?.attempt_id) return undefined
    const onVisibility = () => {
      if (document.hidden) {
        recordEvent('tab_hidden', { visibilityState: document.visibilityState })
        saveDraft('visibility')
      } else {
        recordEvent('returned_to_assessment', { visibilityState: document.visibilityState })
      }
    }
    const onBlur = () => recordEvent('window_blur')
    const onFullscreen = () => {
      if (!document.fullscreenElement) recordEvent('fullscreen_exit')
    }
    const preventAndRecord = eventType => event => {
      event.preventDefault()
      recordEvent(eventType, { target: event.target?.tagName || null })
    }
    const onCopy = preventAndRecord('copy_attempt')
    const onPaste = preventAndRecord('paste_attempt')
    const onCut = preventAndRecord('cut_attempt')
    const onContextMenu = preventAndRecord('right_click')
    const onKeyDown = event => {
      const key = event.key.toLowerCase()
      const blocked = event.key === 'F12' || (event.ctrlKey && (BLOCKED_SHORTCUTS.has(key) || (event.shiftKey && key === 'i')))
      if (!blocked) return
      event.preventDefault()
      recordEvent('blocked_shortcut', { shortcut: shortcutLabel(event) })
    }
    const onBeforeUnload = () => {
      recordEvent('before_unload', {}, { force: true })
      autoSubmitOnLeave('refresh')
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFullscreen)
    document.addEventListener('copy', onCopy)
    document.addEventListener('paste', onPaste)
    document.addEventListener('cut', onCut)
    document.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFullscreen)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [assessment?.attempt_id, autoSubmitOnLeave, recordEvent, saveDraft, started])

  useEffect(() => {
    if (!started) return undefined
    const timer = setInterval(() => saveDraft('interval'), 12000)
    return () => clearInterval(timer)
  }, [saveDraft, started])

  useEffect(() => {
    if (!started || !assessment?.attempt_id) return undefined
    autoSubmitArmedRef.current = false
    const arm = setTimeout(() => { autoSubmitArmedRef.current = true }, 700)
    return () => {
      clearTimeout(arm)
      if (autoSubmitArmedRef.current) autoSubmitOnLeave('route_leave')
    }
  }, [assessment?.attempt_id, autoSubmitOnLeave, started])

  useEffect(() => {
    if (!started || !assessment?.attempt_id) return undefined
    window.history.pushState({ assessmentLock: true }, '', window.location.href)
    const handleBrowserBack = async () => {
      if (hasSubmittedRef.current || submittingRef.current || autoSubmittingRef.current) return
      window.history.pushState({ assessmentLock: true }, '', window.location.href)
      await autoSubmitOnLeave('browser_back', true)
    }
    window.addEventListener('popstate', handleBrowserBack)
    return () => {
      window.removeEventListener('popstate', handleBrowserBack)
    }
  }, [assessment?.attempt_id, autoSubmitOnLeave, started])

  const start = async () => {
    setBusy(true)
    setError('')
    let fullscreenEnabled
    try {
      await document.documentElement.requestFullscreen()
      fullscreenEnabled = true
    } catch {
      fullscreenEnabled = false
    }
    try {
      const response = await api.post(`/assessments/${assessmentId}/attempt/start`)
      if (!response.data.can_start) {
        setAssessment(response.data.assessment || assessment)
        setStarted(false)
        setError('')
        return
      }
      setAssessment(response.data.assessment)
      setStarted(true)
      await recordEvent(fullscreenEnabled ? 'fullscreen_enabled' : 'fullscreen_failed', {}, { attemptId: response.data.attempt_id, force: true })
      if (!fullscreenEnabled) {
        setToast(EVENT_MESSAGES.fullscreen_failed)
        setTimeout(() => setToast(''), 3600)
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const updateAnswer = (questionId, value) => {
    setAnswers(current => {
      const next = { ...current, [questionId]: value }
      answersRef.current = next
      return next
    })
    setTimeout(() => saveDraft('change'), 250)
  }

  const submit = async () => {
    if (!confirm('Submit your assessment? You can submit only once.')) return
    submittingRef.current = true
    hasSubmittedRef.current = true
    setBusy(true)
    try {
      await saveDraft('submit')
      await api.post(`/assessments/${assessmentId}/submit`, responsePayload())
      navigate(`/assessments/${assessmentId}/result`, { replace: true })
    } catch (err) {
      submittingRef.current = false
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  if (error) return <div className="mx-auto max-w-3xl p-6"><p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p></div>
  if (!assessment) return <AssessmentPageSkeleton />
  if (assessment.attempt_status && assessment.attempt_status !== 'in_progress') return <LockedScreen assessment={assessment} />
  const deadline = isTimed(assessment) ? assessment.attempt_expires_at : null
  const remainingMs = deadline ? serverDate(deadline).getTime() - now : null
  const expired = remainingMs != null && remainingMs <= 0

  if (!started) return <RulesScreen assessment={assessment} busy={busy} onStart={start} />

  const answered = assessment.questions.filter(question => (answers[question.id] || '').trim()).length
  const progress = assessment.question_count ? answered / assessment.question_count * 100 : 0

  return <><header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-xl"><div className="mx-auto flex min-h-16 max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6"><div className="flex min-w-0 items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white"><BookOpen size={17} /></span><div className="min-w-0"><p className="truncate text-sm font-bold">{assessment.title}</p><p className="text-xs text-slate-500">{saveStatus || 'Answers auto-save while you work'}</p></div></div><div className="flex flex-wrap items-center gap-2"><FocusBadge warnings={warnings} /><TimingBadge assessment={assessment} remainingMs={remainingMs} /></div></div><div className="h-1 bg-slate-100"><div className="h-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} /></div></header>
    {toast && <div className="fixed right-4 top-20 z-30 max-w-sm rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800 shadow-lift">{toast}</div>}
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{expired && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">Assessment time has expired. Submissions may be rejected.</p>}<div className="mb-6 flex justify-between gap-4"><div><p className="eyebrow">Focus mode active</p><h1 className="mt-1 text-2xl font-bold">Answer every question</h1></div><p className="text-xs font-semibold text-slate-500">{answered}/{assessment.question_count} answered</p></div><div className="space-y-4">{assessment.questions.map((question, index) => <AssessmentQuestion key={question.id} question={question} index={index} value={answers[question.id] || ''} onChange={value => updateAnswer(question.id, value)} />)}</div><div className="sticky bottom-0 -mx-4 mt-7 border-t border-slate-200 bg-slate-100/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-white"><div className="flex items-center justify-between gap-4"><p className="text-xs text-slate-500">Warnings do not block submission. Your teacher can review the activity log.</p><button disabled={busy || !assessment.question_count || expired} onClick={submit} className="btn-primary"><Send size={15} />{busy ? 'Submitting...' : 'Submit'}</button></div></div></main></>
}

function RulesScreen({ assessment, busy, onStart }) {
  const timed = isTimed(assessment)
  return <main className="mx-auto grid min-h-screen max-w-3xl place-items-center px-4 py-10 sm:px-6"><section className="card w-full overflow-hidden"><div className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8"><span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700"><ShieldCheck size={15} />Student focus mode</span><h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">Before you start</h1><p className="mt-2 text-sm leading-6 text-slate-500">{timed ? `This assessment has a ${assessment.duration_minutes} minute timer. ` : ''}Questions will appear after you start.</p></div><div className="px-6 py-6 sm:px-8"><div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><p className="font-bold">Only one attempt is allowed.</p><p className="mt-1">Once you start, leaving, refreshing, closing, or pressing back will automatically submit your current answers.</p><p className="mt-1 font-semibold">You cannot retake this assessment.</p></div><ul className="space-y-3 text-sm leading-6 text-slate-700">{['Stay on the assessment page until you submit.', 'Do not switch tabs, apps, or windows.', 'Do not copy/paste answers from outside.', 'Do not exit fullscreen during the assessment.', 'Suspicious actions will be recorded and shown to the teacher.'].map(rule => <li key={rule} className="flex gap-3"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" /><span>{rule}</span></li>)}</ul><div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><p className="font-semibold">Fullscreen starts from the button below.</p><p className="mt-1 leading-6">If your browser cannot enable fullscreen, you can still continue and your activity will be monitored.</p></div><button type="button" disabled={busy} onClick={onStart} className="btn-primary mt-6 w-full"><Play size={16} />{busy ? 'Starting...' : 'I understand, start assessment'}</button></div></section></main>
}

function LockedScreen({ assessment }) {
  return <main className="mx-auto grid min-h-screen max-w-xl place-items-center px-4 py-10 sm:px-6">
    <section className="card w-full p-8 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircle2 size={27} /></span>
      <h1 className="mt-5 text-2xl font-bold text-slate-950">Assessment already submitted.</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">Only one attempt is allowed. Your submission is pending teacher evaluation.</p>
      {assessment.attempt_status === 'auto_submitted_on_leave' && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">This attempt was auto-submitted because you left the assessment page.</p>}
    </section>
  </main>
}

function FocusBadge({ warnings }) {
  if (!warnings) return <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"><ShieldCheck size={15} />Focus mode active</span>
  return <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800"><AlertTriangle size={15} />Warnings recorded: {warnings}</span>
}

function TimingBadge({ assessment, remainingMs }) {
  if (!isTimed(assessment)) return null
  if (remainingMs != null) {
    const total = Math.max(0, Math.floor(remainingMs / 1000))
    const minutes = Math.floor(total / 60)
    const seconds = total % 60
    const urgent = total <= 300
    return <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${urgent ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}`}><Clock size={15} />{minutes}:{String(seconds).padStart(2, '0')}</span>
  }
  return null
}

function isTimed(assessment) {
  return ['timed', 'timed_deadline'].includes(assessment.timing_mode)
}

function serverDate(value) {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}

function shortcutLabel(event) {
  return `${event.ctrlKey ? 'Ctrl+' : ''}${event.shiftKey ? 'Shift+' : ''}${event.key}`
}

function AssessmentQuestion({ question, index, value, onChange }) {
  return <section className="card p-5 sm:p-7"><div className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span><div><span className="text-[10px] font-bold uppercase tracking-wide text-brand-700">{question.question_type} · {question.marks} marks</span><h2 className="mt-1 font-semibold leading-6 text-slate-900">{question.question_text}</h2></div></div><div className="mt-5 pl-0 sm:pl-10">
    {question.question_type === 'MCQ' && <div className="space-y-2">{['A', 'B', 'C', 'D'].map(option => <label key={option} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${value === option ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}><input type="radio" name={`assessment-${question.id}`} checked={value === option} onChange={() => onChange(option)} /><b>{option}</b><span>{question[`option_${option.toLowerCase()}`]}</span></label>)}</div>}
    {question.question_type === 'FILLUP' && <input className="field" placeholder="Type your answer" value={value} onChange={event => onChange(event.target.value)} />}
    {question.question_type === 'CODING' && <CodingAnswer question={question} value={value} onChange={onChange} />}
  </div></section>
}

function CodingAnswer({ question, value, onChange }) {
  const [saved, setSaved] = useState(false)
  const starterCode = question.starter_code || ''

  const updateCode = code => {
    onChange(code || '')
    setSaved(false)
  }
  const runCode = async code => {
    try {
      const response = await api.post('/code/run', { code, language: 'python' })
      return response.data
    } catch (err) {
      throw new Error(errorMessage(err), { cause: err })
    }
  }
  const runTests = async code => {
    try {
      const response = await api.post('/coding/run', { question_id: question.id, code, language: 'python' })
      return response.data
    } catch (err) {
      throw new Error(errorMessage(err), { cause: err })
    }
  }
  const save = code => {
    onChange(code)
    setSaved(true)
  }

  return <div>
    {question.visible_test_cases && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Visible test cases</p><pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-6 text-slate-700">{question.visible_test_cases}</pre></div>}
    <Suspense fallback={<div className="mt-4 h-[380px] animate-pulse rounded-xl bg-slate-200" />}>
      <PythonCodeWorkspace
        initialCode={value}
        starterCode={starterCode}
        language="python"
        onCodeChange={updateCode}
        onRun={runCode}
        onRunTests={runTests}
        onSubmit={save}
        submitLabel="Save Answer / Continue"
        expectedOutput={question.expected_output}
        showExpectedOutput={false}
      />
    </Suspense>
    {saved && <p className="mt-2 text-xs font-semibold text-emerald-700">Saved for submission</p>}
  </div>
}
