import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Activity, ArrowLeft, CheckCircle2, ClipboardCheck, Download, Eye, FileCode2, Lock, Save, Send, ShieldAlert, Upload, Users, X } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import { importAnswerKey } from '../api/assessments'
import { downloadAnswerKeyEvaluationTemplate, downloadAssessmentImportTemplate } from '../api/templates'
import { PageSkeleton, SectionLoader, SkeletonBlock } from '../components/common/Loading'

function assessmentTimingLabel(assessment) {
  const due = assessment.ends_at ? `Due ${serverDate(assessment.ends_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : ''
  if (assessment.timing_mode === 'timed') return `${assessment.duration_minutes} minutes`
  if (assessment.timing_mode === 'deadline') return due || 'Deadline'
  if (assessment.timing_mode === 'timed_deadline') return `${assessment.duration_minutes} minutes${due ? ` · ${due}` : ''}`
  return 'No time limit'
}

function serverDate(value) {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}

export default function AssessmentDashboard() {
  const { assessmentId } = useParams()
  const [assessment, setAssessment] = useState(null)
  const [preview, setPreview] = useState(null)
  const [attemptsByTab, setAttemptsByTab] = useState({ attempts: null, evaluation: null, results: null })
  const [liveMonitor, setLiveMonitor] = useState(null)
  const [tab, setTab] = useState('question-paper')
  const [error, setError] = useState('')
  const [tabErrors, setTabErrors] = useState({})
  const [tabLoading, setTabLoading] = useState({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [activityLog, setActivityLog] = useState(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const attemptLimit = 20

  const setTabBusy = (name, value) => setTabLoading(current => ({ ...current, [name]: value }))
  const setTabError = (name, value) => setTabErrors(current => ({ ...current, [name]: value }))

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get(`/assessments/${assessmentId}/teacher-summary`)
      setAssessment(data)
      setError('')
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [assessmentId])

  const loadPreview = useCallback(async (force = false) => {
    if (preview && !force) return
    setTabBusy('question-paper', true)
    setTabError('question-paper', '')
    try {
      const { data } = await api.get(`/assessments/${assessmentId}/preview`)
      setPreview(data)
    } catch (err) {
      setTabError('question-paper', errorMessage(err))
    } finally {
      setTabBusy('question-paper', false)
    }
  }, [assessmentId, preview])

  const loadAnswerKey = useCallback(async (force = false) => {
    if (assessment?.questions && !force) return
    setTabBusy('answer-key', true)
    setTabError('answer-key', '')
    try {
      const { data } = await api.get(`/assessments/${assessmentId}/teacher`)
      setAssessment(data)
    } catch (err) {
      setTabError('answer-key', errorMessage(err))
    } finally {
      setTabBusy('answer-key', false)
    }
  }, [assessment?.questions, assessmentId])

  const loadAttemptsTab = useCallback(async (name, force = false) => {
    if (attemptsByTab[name] && !force) return
    setTabBusy(name, true)
    setTabError(name, '')
    try {
      const { data } = await api.get(`/assessments/${assessmentId}/attempts`, { params: { limit: attemptLimit, offset: 0 } })
      setAttemptsByTab(current => ({ ...current, [name]: data }))
    } catch (err) {
      setTabError(name, errorMessage(err))
    } finally {
      setTabBusy(name, false)
    }
  }, [assessmentId, attemptsByTab])

  const loadLiveMonitor = useCallback(async (force = false, quiet = false) => {
    if (liveMonitor && !force) return
    if (!quiet) setTabBusy('live-monitor', true)
    setTabError('live-monitor', '')
    try {
      const { data } = await api.get(`/assessments/${assessmentId}/live-monitor`)
      setLiveMonitor(data)
    } catch (err) {
      setTabError('live-monitor', errorMessage(err))
    } finally {
      if (!quiet) setTabBusy('live-monitor', false)
    }
  }, [assessmentId, liveMonitor])

  useEffect(() => {
    Promise.resolve().then(() => {
      setAssessment(null)
      setPreview(null)
      setAttemptsByTab({ attempts: null, evaluation: null, results: null })
      setLiveMonitor(null)
      setTabErrors({})
      setTabLoading({})
      loadSummary()
    })
  }, [assessmentId, loadSummary])

  useEffect(() => {
    Promise.resolve().then(() => {
      if (tab === 'question-paper') loadPreview()
      if (tab === 'answer-key') loadAnswerKey()
      if (['attempts', 'evaluation', 'results'].includes(tab)) loadAttemptsTab(tab)
      if (tab === 'live-monitor') loadLiveMonitor()
    })
  }, [loadAnswerKey, loadAttemptsTab, loadLiveMonitor, loadPreview, tab])

  useEffect(() => {
    if (tab !== 'live-monitor') return undefined
    const timer = setInterval(() => loadLiveMonitor(true, true), 10000)
    return () => clearInterval(timer)
  }, [loadLiveMonitor, tab])

  const refreshActiveTab = async () => {
    await loadSummary()
    if (tab === 'question-paper') await loadPreview(true)
    if (tab === 'answer-key') await loadAnswerKey(true)
    if (['attempts', 'evaluation', 'results'].includes(tab)) await loadAttemptsTab(tab, true)
    if (tab === 'live-monitor') await loadLiveMonitor(true)
  }

  const action = async (name, request) => {
    setBusy(name); setError(''); setNotice('')
    try { await request(); await refreshActiveTab() } catch (err) { setError(errorMessage(err)) } finally { setBusy('') }
  }

  const handleAnswerKeyImport = async file => {
    setBusy('answer-key-import'); setError(''); setNotice('')
    try {
      const { data } = await importAnswerKey(assessmentId, file)
      if (data.missing_answer_keys === 0) {
        await api.post(`/assessments/${assessmentId}/evaluate`)
      }
      await loadSummary()
      await loadAnswerKey(true)
      if (attemptsByTab.evaluation) await loadAttemptsTab('evaluation', true)
      setNotice(`Answer key imported and pending submissions evaluated. ${data.imported + data.updated} keys updated, ${data.marks_updated} marks updated, ${data.skipped} skipped.${data.errors.length ? ` ${data.errors.join(' ')}` : ''}`)
      return data
    } catch (err) {
      setError(errorMessage(err))
      throw err
    } finally {
      setBusy('')
    }
  }

  const publishAllEvaluated = async () => {
    setBusy('publish-all'); setError(''); setNotice('')
    try {
      const { data } = await api.post(`/assessments/${assessmentId}/publish-results`)
      await refreshActiveTab()
      setNotice(`Published ${data.published} result${data.published === 1 ? '' : 's'}.`)
    } catch (err) {
      setError(err.message || errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  const publishAttempt = async attemptId => {
    setBusy(`publish-${attemptId}`); setError(''); setNotice('')
    try {
      const { data } = await api.post(`/attempts/${attemptId}/publish-result`)
      if (data.status !== 'published') throw new Error('The server did not publish this result. Save all marks and try again.')
      await refreshActiveTab()
      setNotice('This student result has been published.')
    } catch (err) {
      setError(err.message || errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  const unpublishAttempt = async attemptId => {
    setBusy(`unpublish-${attemptId}`); setError(''); setNotice('')
    try {
      await api.post(`/attempts/${attemptId}/unpublish-result`)
      await refreshActiveTab()
      setNotice('This student result has been unpublished.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  const viewActivityLog = async attempt => {
    setActivityLog({ attempt, events: [] })
    setActivityLoading(true)
    try {
      const { data } = await api.get(`/assessment-attempts/${attempt.id}/events`, { params: { limit: attemptLimit, offset: 0 } })
      setActivityLog({ attempt, events: data })
    } catch (err) {
      setError(errorMessage(err))
      setActivityLog(null)
    } finally {
      setActivityLoading(false)
    }
  }

  if (!assessment) return <div>{error ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : <PageSkeleton actions cards={5} />}</div>
  const activeAttempts = attemptsByTab[tab] || []
  const stats = assessment.stats
  const answerKeyQuestions = assessment.questions || []
  const missingObjectiveKeys = answerKeyQuestions.filter(question => (
    question.question_type === 'MCQ' && !['A', 'B', 'C', 'D'].includes(question.answer_key?.correct_answer?.trim().toUpperCase())
  ) || (
    question.question_type === 'FILLUP' && !question.answer_key?.correct_answer?.trim()
  )).length
  const canPublishAll = activeAttempts.length > 0 && activeAttempts.every(isAttemptFullyEvaluated) && activeAttempts.some(isAttemptPublishable)

  return <div className="mx-auto max-w-6xl"><Link to={`/assessments/${assessment.id}`} className="back-link"><ArrowLeft size={16} />Assessment</Link>
    <div className="mt-6 flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><p className="eyebrow">Teacher dashboard{assessment.archived ? ' · Archived' : ''}</p><h1 className="page-title mt-2">{assessment.title}</h1><p className="mt-2 text-sm text-slate-500">Review answer keys, evaluate submissions, and publish results.</p></div><div className="flex flex-wrap gap-2"><button disabled={busy || assessment.archived} onClick={() => action('status', () => api.put(`/assessments/${assessment.id}`, { is_published: true, is_accepting_responses: !assessment.is_accepting_responses }))} className="btn-secondary">{assessment.is_accepting_responses ? <Lock size={15} /> : <Eye size={15} />}{assessment.is_accepting_responses ? 'Close responses' : 'Open responses'}</button><button disabled={busy || !stats.pending_count || missingObjectiveKeys > 0} onClick={() => action('evaluate', () => api.post(`/assessments/${assessment.id}/evaluate`))} className="btn-secondary"><ClipboardCheck size={15} />{busy === 'evaluate' ? 'Evaluating…' : 'Evaluate pending'}</button><button disabled={busy || !canPublishAll || assessment.archived} onClick={publishAllEvaluated} className="btn-primary" title={!canPublishAll ? 'Available after every submitted student is fully evaluated.' : undefined}><Send size={15} />{busy === 'publish-all' ? 'Publishing…' : 'Publish All Results'}</button></div></div>
    {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Class students" value={stats.total_students} icon={<Users size={16} />} /><Stat label="Submitted" value={stats.submitted_count} /><Stat label="Pending" value={stats.pending_count} /><Stat label="Evaluated" value={stats.evaluated_count} /><Stat label="Published" value={stats.published_count} icon={<CheckCircle2 size={16} />} /></div>
    <div className="mt-7 flex gap-1 overflow-x-auto border-b border-slate-200"><Tab active={tab === 'question-paper'} onClick={() => setTab('question-paper')}>Question Paper</Tab><Tab active={tab === 'answer-key'} onClick={() => setTab('answer-key')}>Answer Key</Tab><Tab active={tab === 'attempts'} onClick={() => setTab('attempts')}>Attempts ({stats.submitted_count})</Tab><Tab active={tab === 'evaluation'} onClick={() => setTab('evaluation')}>Evaluation</Tab><Tab active={tab === 'results'} onClick={() => setTab('results')}>Results</Tab><Tab active={tab === 'live-monitor'} onClick={() => setTab('live-monitor')}>Live Monitor</Tab><Tab active={tab === 'templates'} onClick={() => setTab('templates')}>Templates</Tab></div>
    {tab !== 'templates' && <TabStatus loading={tabLoading[tab]} error={tabErrors[tab]} onRefresh={refreshActiveTab} />}
    {tab === 'question-paper' && !tabLoading[tab] && !tabErrors[tab] && <QuestionPaper assessment={preview || assessment} />}
    {tab === 'answer-key' && !tabLoading[tab] && !tabErrors[tab] && <AnswerKey questions={answerKeyQuestions} onImport={handleAnswerKeyImport} importing={busy === 'answer-key-import'} />}
    {tab === 'attempts' && !tabLoading[tab] && !tabErrors[tab] && <AttemptsSummary attempts={attemptsByTab.attempts || []} onEvaluate={() => setTab('evaluation')} onViewActivity={viewActivityLog} limit={attemptLimit} total={stats.submitted_count} />}
    {tab === 'evaluation' && !tabLoading[tab] && !tabErrors[tab] && <EvaluationPanel attempts={attemptsByTab.evaluation || []} onSaved={refreshActiveTab} onImport={handleAnswerKeyImport} evaluate={() => action('evaluate', () => api.post(`/assessments/${assessment.id}/evaluate`))} publishAll={publishAllEvaluated} publishAttempt={publishAttempt} unpublishAttempt={unpublishAttempt} viewResults={() => setTab('results')} viewActivityLog={viewActivityLog} busy={busy} missingObjectiveKeys={missingObjectiveKeys} canPublishAll={canPublishAll} limit={attemptLimit} total={stats.submitted_count} />}
    {tab === 'results' && !tabLoading[tab] && !tabErrors[tab] && <Results attempts={attemptsByTab.results || []} publishAttempt={publishAttempt} unpublishAttempt={unpublishAttempt} viewAttempt={() => setTab('evaluation')} busy={busy} limit={attemptLimit} total={stats.submitted_count} />}
    {tab === 'live-monitor' && !tabLoading[tab] && !tabErrors[tab] && <LiveMonitor data={liveMonitor} onRefresh={() => loadLiveMonitor(true)} onViewActivity={viewActivityLog} />}
    {tab === 'templates' && <TemplatesPanel />}
    {activityLog && <ActivityLogModal attempt={activityLog.attempt} events={activityLog.events} loading={activityLoading} onClose={() => setActivityLog(null)} />}
  </div>
}

function Stat({ label, value, icon }) { return <div className="card p-4"><p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">{icon}{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p></div> }
function Tab({ active, onClick, children }) { return <button onClick={onClick} className={`border-b-2 px-4 py-3 text-sm font-semibold ${active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>{children}</button> }

function TabStatus({ loading, error, onRefresh }) {
  if (loading) return <TabSkeleton />
  if (!error) return null
  return <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <p className="font-semibold">{error}</p>
    <button type="button" onClick={onRefresh} className="btn-secondary mt-3">Refresh</button>
  </div>
}

function TabSkeleton() {
  return <SectionLoader rows={3} />
}

function QuestionPaper({ assessment }) {
  return <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
    <header className="border-b border-slate-200 bg-slate-50 px-5 py-5 sm:px-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-brand-700">Question paper</p><h2 className="mt-1 text-xl font-bold text-slate-950">{assessment.title}</h2><p className="mt-1 text-sm text-slate-500">{assessmentTimingLabel(assessment)} · {assessment.question_count} questions</p></div><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><Eye size={14} />Student preview - answers are hidden</span></div></header>
    <div className="divide-y divide-slate-200">{assessment.questions.map((question, index) => <PreviewQuestion key={question.id} question={question} index={index} />)}</div>
    {!assessment.questions.length && <div className="empty-state m-5">No questions have been imported yet.</div>}
  </section>
}

const PreviewQuestion = memo(function PreviewQuestion({ question, index }) {
  return <article className="px-5 py-6 sm:px-7"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-brand-700">Question {index + 1} · {question.question_type} · {question.marks} {question.marks === 1 ? 'mark' : 'marks'}</p>{(question.difficulty || question.tags) && <span className="text-xs text-slate-400">{question.difficulty}{question.difficulty && question.tags ? ' · ' : ''}{question.tags}</span>}</div><h3 className="mt-3 font-semibold leading-7 text-slate-900">{question.question_text}</h3>
    {question.question_type === 'MCQ' && <div className="mt-4 grid gap-2 sm:grid-cols-2">{[['A', question.option_a], ['B', question.option_b], ['C', question.option_c], ['D', question.option_d]].map(([letter, option]) => <div key={letter} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-700"><span className="grid size-6 shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-600">{letter}</span><span className="pt-0.5 leading-5">{option}</span></div>)}</div>}
    {question.question_type === 'FILLUP' && <div className="mt-5 h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-400">Student answer</div>}
    {question.question_type === 'CODING' && <div className="mt-4 space-y-3">{question.starter_code && <PreviewCode label="Starter code" value={question.starter_code} />}{question.visible_test_cases && <PreviewCode label="Visible test cases" value={question.visible_test_cases} />}{question.expected_output && <PreviewCode label="Expected output" value={question.expected_output} />}{!question.starter_code && !question.visible_test_cases && !question.expected_output && <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500"><FileCode2 size={18} className="mb-2" />Students will write their code response here.</div>}</div>}
  </article>
})

function PreviewCode({ label, value }) { return <div><p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-4 text-xs leading-6 text-slate-100">{value}</pre></div> }

function hasAnswerKey(question) {
  if (!question.answer_key) return false
  if (question.question_type === 'MCQ') return ['A', 'B', 'C', 'D'].includes(question.answer_key.correct_answer?.trim().toUpperCase())
  if (question.question_type === 'FILLUP') return Boolean(question.answer_key.correct_answer?.trim())
  return true
}

function AnswerKey({ questions, onImport, importing }) {
  const available = questions.filter(hasAnswerKey).length
  return <div className="mt-5 space-y-3"><div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center"><p className="flex items-start gap-2 text-sm font-semibold text-amber-800"><ShieldAlert size={18} className="mt-0.5 shrink-0" />Private answer key. This is visible only to teachers.</p><AnswerKeyImportButton onImport={onImport} importing={importing} /></div><div className="grid gap-3 sm:grid-cols-3"><Stat label="Total questions" value={questions.length} /><Stat label="Answer keys available" value={available} /><Stat label="Missing answer keys" value={questions.length - available} /></div>{questions.map((question, index) => {
    const key = question.answer_key
    const missing = !hasAnswerKey(question)
    return <article key={question.id} className={`card p-5 ${missing ? 'border-amber-300' : ''}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-brand-700">Question {index + 1} · {question.question_type} · {question.marks} marks</p><span className="text-xs text-slate-400">{question.difficulty || 'No difficulty'}{question.tags ? ` · ${question.tags}` : ''}</span></div><h3 className="mt-2 font-semibold leading-6">{question.question_text}</h3>{question.question_type === 'MCQ' && <p className="mt-3 text-sm text-slate-500">A. {question.option_a} · B. {question.option_b} · C. {question.option_c} · D. {question.option_d}</p>}{missing ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Answer key missing for this question.</p> : <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><p className="text-xs font-bold uppercase text-slate-400">Correct answer</p><p className="mt-1 font-semibold">{question.question_type === 'CODING' && !key.correct_answer ? 'Teacher review required' : key.correct_answer}</p></div><div><p className="text-xs font-bold uppercase text-slate-400">Accepted answers</p><p className="mt-1 font-semibold">{key.accepted_answers || '—'}</p></div><div><p className="text-xs font-bold uppercase text-slate-400">Explanation</p><p className="mt-1 text-slate-600">{key.explanation || '—'}</p></div>{question.question_type === 'CODING' && key.hidden_test_cases && <div><p className="text-xs font-bold uppercase text-slate-400">Hidden test cases</p><pre className="mt-1 whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-slate-200">{key.hidden_test_cases}</pre></div>}</div>}</article>
  })}</div>
}

function TemplatesPanel() {
  return <section className="card mt-5 p-5"><h2 className="font-bold text-slate-900">Templates</h2><p className="mt-1 text-sm leading-6 text-slate-500">Use these templates to prepare assessments and evaluate student submissions offline if needed.</p><p className="mt-2 text-xs leading-5 text-slate-500">Use the question template to prepare import-ready assessments. Use the evaluation template to review answer keys, student responses, and result summaries.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={downloadAssessmentImportTemplate} className="btn-secondary"><Download size={15} />Download Question Import Template</button><button onClick={downloadAnswerKeyEvaluationTemplate} className="btn-secondary"><Download size={15} />Download Answer Key / Evaluation Template</button></div></section>
}

function publishStatus(attempt) {
  if (attempt.status === 'published') return 'Published'
  if (attempt.status === 'auto_submitted_on_leave') return 'Auto-submitted on leave'
  if (isAttemptPublishable(attempt)) return 'Ready to publish'
  if (attempt.status === 'evaluated') return 'Evaluated, not published'
  if (attempt.status === 'pending_evaluation' || attempt.status === 'submitted') return 'Pending evaluation'
  return attempt.status.replaceAll('_', ' ')
}

function remainingReviewCount(attempt) {
  return attempt.responses.filter(response => ['needs_review', 'answer_key_missing'].includes(getResponseStatus(response))).length
}

function isAttemptPublishable(attempt) {
  return attempt.status !== 'published' && remainingReviewCount(attempt) === 0
}

function isAttemptFullyEvaluated(attempt) {
  return attempt.status === 'published' || remainingReviewCount(attempt) === 0
}

function publishHelpText(attempt) {
  const remaining = remainingReviewCount(attempt)
  if (remaining > 0) return `${remaining} question${remaining === 1 ? '' : 's'} still need marks or an answer key.`
  if (attempt.status === 'published') return 'This result is already published.'
  return ''
}

function ListLimitNotice({ count, total, limit }) {
  if (!total || total <= limit || count >= total) return null
  return <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-500">Showing latest {count} of {total}. Use Refresh to reload the latest submissions.</p>
}

function LiveMonitor({ data, onRefresh, onViewActivity }) {
  if (!data) return <SectionLoader rows={3} />
  const summaryItems = [
    ['Total students', data.summary.total_students],
    ['Not started', data.summary.not_started],
    ['In progress', data.summary.in_progress],
    ['Submitted', data.summary.submitted],
    ['Left halfway', data.summary.left_halfway],
    ['Suspicious', data.summary.suspicious],
  ]
  return <section className="mt-5 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-bold text-slate-900">Live monitor</h2><p className="mt-1 text-sm text-slate-500">Updates every 10 seconds while this tab is open.</p></div>
      <button type="button" onClick={onRefresh} className="btn-secondary">Refresh</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{summaryItems.map(([label, value]) => <Stat key={label} label={label} value={value} />)}</div>
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Warnings</th><th className="px-5 py-3">Started</th><th className="px-5 py-3">Last activity</th><th className="px-5 py-3">Actions</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{data.students.map(student => <tr key={student.student_id}>
            <td className="px-5 py-4 font-semibold">{student.student_name}</td>
            <td className="px-5 py-4 text-slate-500">{student.email}</td>
            <td className="px-5 py-4"><LiveStatusBadge student={student} /></td>
            <td className="px-5 py-4"><WarningBadge attempt={{ warning_count: student.warning_count, focus_status: student.focus_status }} /></td>
            <td className="px-5 py-4 text-slate-500">{formatDateTime(student.started_at)}</td>
            <td className="px-5 py-4"><p className="text-slate-500">{formatDateTime(student.last_activity_at)}</p>{student.last_event_type && <p className="mt-1 text-xs font-semibold text-slate-400">{formatEventType(student.last_event_type)}</p>}</td>
            <td className="px-5 py-4">{student.attempt_id ? <button type="button" onClick={() => onViewActivity({ id: student.attempt_id, student_name: student.student_name, student_email: student.email, warning_count: student.warning_count, focus_status: student.focus_status })} className="btn-secondary"><Activity size={15} />View activity log</button> : <span className="text-xs font-semibold text-slate-400">No attempt yet</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </section>
}

function LiveStatusBadge({ student }) {
  const status = student.focus_status === 'suspicious' && student.status !== 'not_started' ? 'suspicious' : student.status
  const labels = {
    not_started: 'Not started',
    in_progress: 'In progress',
    submitted: 'Submitted',
    pending_evaluation: 'Submitted',
    evaluated: 'Submitted',
    published: 'Submitted',
    left_halfway: 'Left halfway',
    auto_submitted_on_leave: 'Left halfway',
    suspicious: 'Suspicious',
  }
  const colors = {
    not_started: 'border-slate-200 bg-slate-100 text-slate-600',
    in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
    submitted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    pending_evaluation: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    evaluated: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    left_halfway: 'border-red-200 bg-red-50 text-red-700',
    auto_submitted_on_leave: 'border-red-200 bg-red-50 text-red-700',
    suspicious: 'border-red-200 bg-red-50 text-red-700',
  }
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${colors[status] || colors.not_started}`}>{labels[status] || status.replaceAll('_', ' ')}</span>
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '—'
}

function Results({ attempts, publishAttempt, unpublishAttempt, viewAttempt, busy, limit, total }) {
  if (!attempts.length) return <div className="empty-state mt-5">No assessment results are available yet.</div>
  return <><section className="card mt-5 overflow-hidden"><header className="border-b border-slate-200 bg-slate-50 px-5 py-4"><h2 className="font-bold text-slate-900">Result overview</h2><p className="mt-1 text-xs text-slate-500">Each student sees their result only after that attempt is published.</p></header><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Percentage</th><th className="px-4 py-3">Evaluation</th><th className="px-4 py-3">Publish status</th><th className="px-4 py-3">Published at</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{attempts.map(attempt => <tr key={attempt.id}><td className="px-4 py-4 font-semibold">{attempt.student_name}</td><td className="px-4 py-4 text-slate-500">{attempt.student_email}</td><td className="px-4 py-4 font-bold">{attempt.score}</td><td className="px-4 py-4">{attempt.total_marks}</td><td className="px-4 py-4 font-semibold">{attempt.total_marks ? Math.round(attempt.score / attempt.total_marks * 100) : 0}%</td><td className="px-4 py-4 capitalize text-slate-600">{attempt.status === 'published' ? 'Evaluated' : attempt.status.replaceAll('_', ' ')}</td><td className="px-4 py-4 font-semibold">{publishStatus(attempt)}</td><td className="px-4 py-4 text-slate-500">{attempt.published_at ? new Date(attempt.published_at).toLocaleString() : '—'}</td><td className="px-4 py-4"><div className="flex flex-wrap gap-2"><button onClick={viewAttempt} className="btn-secondary">View</button>{attempt.status !== 'published' && <button disabled={busy === `publish-${attempt.id}` || !isAttemptPublishable(attempt)} title={publishHelpText(attempt)} onClick={() => publishAttempt(attempt.id)} className="btn-secondary">{busy === `publish-${attempt.id}` ? 'Publishing…' : 'Publish'}</button>}{attempt.status === 'published' && <button disabled={busy === `unpublish-${attempt.id}`} onClick={() => unpublishAttempt(attempt.id)} className="btn-secondary">{busy === `unpublish-${attempt.id}` ? 'Unpublishing…' : 'Unpublish'}</button>}</div></td></tr>)}</tbody></table></div></section><ListLimitNotice count={attempts.length} total={total} limit={limit} /></>
}

function AttemptsSummary({ attempts, onEvaluate, onViewActivity, limit, total }) {
  if (!attempts.length) return <div className="empty-state mt-5">No students have submitted this assessment.</div>
  return <><div className="card mt-5 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Student name</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Submitted at</th><th className="px-5 py-3">Submitted status</th><th className="px-5 py-3">Warnings</th><th className="px-5 py-3">Score / status</th><th className="px-5 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{attempts.map(attempt => <tr key={attempt.id}><td className="px-5 py-4 font-semibold">{attempt.student_name}</td><td className="px-5 py-4 text-slate-500">{attempt.student_email}</td><td className="px-5 py-4 text-slate-500">{new Date(attempt.submitted_at).toLocaleString()}</td><td className="px-5 py-4"><p className="capitalize">{attempt.status.replaceAll('_', ' ')}</p>{attempt.auto_submit_reason && <p className="mt-1 text-xs font-semibold text-amber-700">{attempt.auto_submit_reason.replaceAll('_', ' ')}</p>}</td><td className="px-5 py-4"><WarningBadge attempt={attempt} /></td><td className="px-5 py-4"><p className="font-semibold">{attempt.score}/{attempt.total_marks}</p><p className="mt-1 text-xs text-slate-500">{publishStatus(attempt)}</p></td><td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button onClick={onEvaluate} className="btn-secondary">View Attempt</button><button onClick={onEvaluate} className="btn-secondary">Evaluate</button><button onClick={() => onViewActivity(attempt)} className="btn-secondary"><Activity size={15} />View Activity Log</button></div></td></tr>)}</tbody></table></div></div><ListLimitNotice count={attempts.length} total={total} limit={limit} /></>
}

function getResponseStatus(response) {
  if (response.response_status) return response.response_status
  const hasAnswer = Boolean((response.selected_option || response.text_answer || response.code_answer || '').trim())
  if (!hasAnswer) return 'not_answered'
  if (response.question_type === 'MCQ' && !['A', 'B', 'C', 'D'].includes(response.correct_answer?.trim().toUpperCase())) return 'answer_key_missing'
  if (response.question_type === 'FILLUP' && !response.correct_answer?.trim()) return 'answer_key_missing'
  if (response.question_type === 'CODING' && response.is_correct == null && (!response.feedback || ['Coding answer requires teacher review.', 'Manual coding review required'].includes(response.feedback))) return 'needs_review'
  if (response.is_correct === true) return 'correct'
  if (response.is_correct === false) return 'incorrect'
  return 'needs_review'
}

function EvaluationPanel({ attempts, onSaved, onImport, evaluate, publishAll, publishAttempt, unpublishAttempt, viewResults, viewActivityLog, busy, missingObjectiveKeys, canPublishAll, limit, total }) {
  const [filter, setFilter] = useState('all')
  const responses = attempts.flatMap(attempt => attempt.responses)
  const counts = responses.reduce((summary, response) => {
    const status = getResponseStatus(response)
    summary[status] = (summary[status] || 0) + 1
    return summary
  }, {})
  const filters = [
    ['all', 'All', responses.length],
    ['correct', 'Correct', counts.correct || 0],
    ['incorrect', 'Incorrect', counts.incorrect || 0],
    ['needs_review', 'Needs Review', counts.needs_review || 0],
    ['not_answered', 'Not Answered', counts.not_answered || 0],
    ['answer_key_missing', 'Missing Key', counts.answer_key_missing || 0],
  ]
  return <div className="mt-5"><div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-800">Evaluation does not publish results automatically. Review marks and activity logs before publishing.</p>{missingObjectiveKeys > 0 && <p className="mt-2 text-sm font-semibold text-red-700">Some MCQ/FILLUP questions are missing answer keys. Import answer key before evaluation.</p>}<div className="mt-3 flex flex-wrap gap-2"><AnswerKeyImportButton onImport={onImport} importing={busy === 'answer-key-import'} /><button onClick={evaluate} disabled={busy === 'evaluate' || missingObjectiveKeys > 0} className="btn-secondary"><ClipboardCheck size={15} />{busy === 'evaluate' ? 'Evaluating…' : 'Evaluate Pending Submissions'}</button><button disabled className="btn-secondary"><Download size={15} />Export Evaluation Workbook</button><button onClick={publishAll} disabled={busy === 'publish-all' || !canPublishAll} title={!canPublishAll ? 'Available after every submitted student is fully evaluated.' : undefined} className="btn-primary"><Send size={15} />{busy === 'publish-all' ? 'Publishing…' : 'Publish All Results'}</button></div>{attempts.length > 0 && !canPublishAll && <p className="mt-2 text-xs font-semibold text-amber-700">Publish All Results unlocks after every submitted student has marks for every question. Use each student’s publish button when only one result is ready.</p>}</div><ListLimitNotice count={attempts.length} total={total} limit={limit} /><div className="mb-4 mt-4 flex flex-wrap gap-2">{filters.map(([value, label, count]) => <button type="button" key={value} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${filter === value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{label} <span className={filter === value ? 'text-brand-100' : 'text-slate-400'}>{count}</span></button>)}</div><Attempts attempts={attempts} onSaved={onSaved} filter={filter} publishAttempt={publishAttempt} unpublishAttempt={unpublishAttempt} viewResults={viewResults} viewActivityLog={viewActivityLog} busy={busy} /></div>
}

function AnswerKeyImportButton({ onImport, importing }) {
  const inputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const chooseFile = () => inputRef.current?.click()
  const selected = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFileName(file.name)
    try { await onImport(file); setFileName('') } catch { /* Parent displays the API error. */ }
  }
  return <div className="flex flex-wrap items-center gap-2"><input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={selected} className="hidden" /><button type="button" onClick={chooseFile} disabled={importing} className="btn-secondary"><Upload size={15} />{importing ? 'Importing answer key...' : 'Import Answer Key'}</button>{fileName && <span className="max-w-56 truncate text-xs text-slate-500" title={fileName}>{fileName}</span>}</div>
}

function Attempts({ attempts, onSaved, filter = 'all', publishAttempt, unpublishAttempt, viewResults, viewActivityLog, busy }) {
  if (!attempts.length) return <div className="empty-state mt-5">No students have submitted this assessment.</div>
  const visibleAttempts = attempts.map(attempt => ({
    ...attempt,
    visibleResponses: filter === 'all' ? attempt.responses : attempt.responses.filter(response => getResponseStatus(response) === filter),
  })).filter(attempt => attempt.visibleResponses.length)
  if (!visibleAttempts.length) return <div className="empty-state mt-5">No responses match this filter.</div>
  return <div className="mt-5 space-y-4">{visibleAttempts.map(attempt => <AttemptEvaluationCard key={`${attempt.id}-${attempt.responses.map(response => `${response.id}:${response.awarded_marks}:${response.feedback || ''}`).join('|')}`} attempt={attempt} onSaved={onSaved} publishAttempt={publishAttempt} unpublishAttempt={unpublishAttempt} viewResults={viewResults} viewActivityLog={viewActivityLog} busy={busy} />)}</div>
}

function AttemptEvaluationCard({ attempt, onSaved, publishAttempt, unpublishAttempt, viewResults, viewActivityLog, busy }) {
  const [drafts, setDrafts] = useState(() => Object.fromEntries(attempt.responses.map(response => [response.id, { marks: response.awarded_marks, feedback: response.feedback || '' }])))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const updateDraft = (responseId, changes) => setDrafts(current => ({ ...current, [responseId]: { ...current[responseId], ...changes } }))
  const saveAll = async () => {
    setSaving(true)
    setSaveError('')
    const payload = attempt.responses.map(response => ({
      response_id: response.id,
      awarded_marks: Number(drafts[response.id]?.marks ?? 0),
      feedback: drafts[response.id]?.feedback || null,
    }))
    try {
      await api.put(`/attempts/${attempt.id}/marks`, { responses: payload })
    } catch (err) {
      if (err.response?.status !== 404) {
        setSaveError(errorMessage(err))
        setSaving(false)
        return
      }
      try {
        await Promise.all(payload.map(item => api.put(`/attempts/${attempt.id}/responses/${item.response_id}/marks`, {
          awarded_marks: item.awarded_marks,
          feedback: item.feedback,
        })))
      } catch (fallbackErr) {
        setSaveError(errorMessage(fallbackErr))
        setSaving(false)
        return
      }
    }
    try {
      await onSaved()
    } catch (reloadErr) {
      setSaveError(errorMessage(reloadErr))
    } finally {
      setSaving(false)
    }
  }
  const disabled = attempt.status === 'published'
  return <article className="card overflow-hidden"><header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4"><div><h3 className="font-bold">{attempt.student_name}</h3><p className="mt-0.5 text-xs text-slate-500">Submitted {new Date(attempt.submitted_at).toLocaleString()}</p><div className="mt-2 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white px-2.5 py-1 font-bold capitalize text-slate-600">Status: {attempt.status === 'published' ? 'evaluated' : attempt.status.replaceAll('_', ' ')}</span><span className={`rounded-full px-2.5 py-1 font-bold ${attempt.status === 'published' ? 'bg-emerald-100 text-emerald-700' : isAttemptPublishable(attempt) ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>Result: {attempt.status === 'published' ? 'Published' : isAttemptPublishable(attempt) ? 'Ready to Publish' : 'Not Published'}</span><WarningBadge attempt={attempt} /></div>{attempt.auto_submit_reason && <p className="mt-2 text-xs font-semibold text-amber-700">Auto-submit reason: {attempt.auto_submit_reason.replaceAll('_', ' ')}</p>}{attempt.published_at && <p className="mt-2 text-xs text-slate-500">Published {new Date(attempt.published_at).toLocaleString()}</p>}</div><div className="flex flex-col items-end gap-2"><p className="text-sm font-bold">{attempt.score}/{attempt.total_marks}</p><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={viewResults} className="btn-secondary">View Result Preview</button><button type="button" onClick={() => viewActivityLog(attempt)} className="btn-secondary"><Activity size={15} />View Activity Log</button>{attempt.status !== 'published' && <button type="button" disabled={saving} onClick={saveAll} className="btn-secondary"><Save size={15} />{saving ? 'Saving…' : 'Save All Marks'}</button>}{attempt.status !== 'published' && <button type="button" disabled={busy === `publish-${attempt.id}` || !isAttemptPublishable(attempt)} title={publishHelpText(attempt)} onClick={() => publishAttempt(attempt.id)} className="btn-primary">{busy === `publish-${attempt.id}` ? 'Publishing…' : 'Publish This Result'}</button>}{attempt.status === 'published' && <button type="button" disabled={busy === `unpublish-${attempt.id}`} onClick={() => unpublishAttempt(attempt.id)} className="btn-secondary">{busy === `unpublish-${attempt.id}` ? 'Unpublishing…' : 'Unpublish Result'}</button>}</div>{attempt.status !== 'published' && !isAttemptPublishable(attempt) && <p className="max-w-sm text-right text-xs font-semibold text-amber-700">{publishHelpText(attempt)}</p>}</div>{saveError && <p className="basis-full rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}</header><div className="divide-y divide-slate-100">{attempt.visibleResponses.map(response => <ResponseEditor key={response.id} response={response} draft={drafts[response.id] || { marks: response.awarded_marks, feedback: response.feedback || '' }} disabled={disabled || saving} onDraftChange={changes => updateDraft(response.id, changes)} />)}</div></article>
}

function ResponseEditor({ response, draft, disabled, onDraftChange }) {
  const status = getResponseStatus(response)
  const statusStyles = {
    correct: { label: 'Correct', badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', student: 'border border-emerald-200 bg-emerald-50 text-emerald-900' },
    incorrect: { label: 'Incorrect', badge: 'border-red-200 bg-red-50 text-red-700', student: 'border border-red-200 bg-red-50 text-red-900' },
    needs_review: { label: 'Needs Manual Review', badge: 'border-amber-200 bg-amber-50 text-amber-800', student: 'border border-amber-200 bg-amber-50 text-amber-900' },
    not_answered: { label: 'Not Answered', badge: 'border-slate-200 bg-slate-100 text-slate-600', student: 'border border-slate-200 bg-slate-50 text-slate-500' },
    answer_key_missing: { label: 'Answer Key Missing', badge: 'border-orange-200 bg-orange-50 text-orange-700', student: 'border border-orange-200 bg-orange-50 text-orange-900' },
  }[status]
  const answerMissing = status === 'answer_key_missing'
  const teacherAnswer = response.question_type === 'CODING'
    ? 'Teacher review required'
    : answerMissing
      ? 'Answer key missing'
      : response.question_type === 'FILLUP' && response.accepted_answers
        ? `Correct: ${response.correct_answer}\nAccepted: ${response.accepted_answers}`
        : response.correct_answer
  const studentAnswer = response.selected_option || response.text_answer || response.code_answer || 'No answer submitted'
  return <div className="p-5"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold uppercase text-slate-400">{response.question_type}</p><span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${statusStyles.badge}`}>{statusStyles.label}</span></div><h4 className="mt-2 font-semibold">{response.question_text}</h4><div className="mt-3 grid gap-3 lg:grid-cols-2"><div><p className="mb-1 text-xs font-bold uppercase text-slate-400">Student answer</p><pre className={`whitespace-pre-wrap rounded-lg p-3 text-sm ${statusStyles.student}`}>{studentAnswer}</pre>{status === 'incorrect' && <p className="mt-2 text-xs font-semibold text-red-700">Student answer does not match the answer key.</p>}{status === 'answer_key_missing' && <p className="mt-2 text-xs font-semibold text-orange-700">Import answer key before evaluating this question.</p>}</div><div><p className="mb-1 text-xs font-bold uppercase text-slate-400">Correct / accepted answer</p><pre className={`whitespace-pre-wrap rounded-lg border p-3 text-sm ${answerMissing ? 'border-orange-200 bg-orange-50 text-orange-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{teacherAnswer}</pre>{response.explanation && <p className="mt-2 text-xs leading-5 text-slate-500">{response.explanation}</p>}{response.question_type === 'CODING' && response.hidden_test_cases && <div className="mt-3"><p className="mb-1 text-xs font-bold uppercase text-slate-400">Hidden test cases</p><pre className="whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{response.hidden_test_cases}</pre></div>}</div></div><div className="mt-3 grid gap-3 sm:grid-cols-[130px_1fr]"><label><span className="label">Marks / {response.max_marks}</span><input className="field" disabled={disabled} type="number" min="0" max={response.max_marks} step="0.5" value={draft.marks} onChange={event => onDraftChange({ marks: event.target.value })} /></label><label><span className="label">Feedback</span><input className="field" disabled={disabled} value={draft.feedback} onChange={event => onDraftChange({ feedback: event.target.value })} /></label></div></div>
}

function WarningBadge({ attempt, count = attempt?.warning_count || 0 }) {
  const status = attempt?.focus_status || (count >= 3 ? 'suspicious' : count > 0 ? 'warnings' : 'clean')
  const clean = status === 'clean'
  const suspicious = status === 'suspicious'
  const label = clean ? 'Clean' : suspicious ? 'Suspicious' : 'Warnings'
  const title = attempt?.last_warning_at ? `Last warning: ${new Date(attempt.last_warning_at).toLocaleString()}` : undefined
  const classes = clean
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : suspicious
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-amber-200 bg-amber-50 text-amber-800'
  return <span title={title} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${classes}`}>
    <ShieldAlert size={13} />{label}{count > 0 ? ` · ${count}` : ''}
  </span>
}

function ActivityLogModal({ attempt, events, loading, onClose }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
    <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div>
          <p className="eyebrow">Activity log</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">{attempt.student_name}</h2>
          <p className="mt-1 text-sm text-slate-500">{attempt.student_email}</p>
        </div>
        <button type="button" onClick={onClose} className="btn-secondary px-3" aria-label="Close activity log"><X size={16} /></button>
      </header>
      <div className="max-h-[65vh] overflow-y-auto p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3"><WarningBadge attempt={attempt} />{attempt.last_warning_at && <span className="text-xs font-semibold text-slate-500">Last warning {new Date(attempt.last_warning_at).toLocaleString()}</span>}</div>
        {loading && <SkeletonBlock className="h-28 rounded-2xl" />}
        {!loading && !events.length && <div className="empty-state">No focus-mode activity has been recorded for this attempt.</div>}
        {!loading && events.length > 0 && <ol className="space-y-3">
          {events.map(event => <li key={event.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">{formatEventType(event.event_type)}</p>
              <time className="text-xs font-semibold text-slate-500">{new Date(event.created_at).toLocaleTimeString()}</time>
            </div>
            <p className="mt-1 text-sm text-slate-600">{event.event_message}</p>
            {event.metadata && Object.keys(event.metadata).length > 0 && <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">{JSON.stringify(event.metadata, null, 2)}</pre>}
          </li>)}
        </ol>}
      </div>
    </section>
  </div>
}

function formatEventType(value) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}
