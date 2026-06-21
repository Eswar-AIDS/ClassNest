import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Download, Eye, FileCode2, Lock, Save, Send, ShieldAlert, Upload, Users } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import { importAnswerKey } from '../api/assessments'
import { downloadAnswerKeyEvaluationTemplate, downloadAssessmentImportTemplate } from '../api/templates'

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
  const [attempts, setAttempts] = useState([])
  const [tab, setTab] = useState('question-paper')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')

  const load = async () => {
    try {
      const [detail, paper, submissions] = await Promise.all([api.get(`/assessments/${assessmentId}/teacher`), api.get(`/assessments/${assessmentId}/preview`), api.get(`/assessments/${assessmentId}/attempts`)])
      setAssessment(detail.data); setPreview(paper.data); setAttempts(submissions.data); setError('')
    } catch (err) { setError(errorMessage(err)) }
  }
  useEffect(() => {
    Promise.all([
      api.get(`/assessments/${assessmentId}/teacher`),
      api.get(`/assessments/${assessmentId}/preview`),
      api.get(`/assessments/${assessmentId}/attempts`),
    ]).then(([detail, paper, submissions]) => {
      setAssessment(detail.data)
      setPreview(paper.data)
      setAttempts(submissions.data)
    }).catch(err => setError(errorMessage(err)))
  }, [assessmentId])

  const action = async (name, request) => {
    setBusy(name); setError(''); setNotice('')
    try { await request(); await load() } catch (err) { setError(errorMessage(err)) } finally { setBusy('') }
  }

  const handleAnswerKeyImport = async file => {
    setBusy('answer-key-import'); setError(''); setNotice('')
    try {
      const { data } = await importAnswerKey(assessmentId, file)
      if (data.missing_answer_keys === 0) {
        await api.post(`/assessments/${assessmentId}/evaluate`)
      }
      await load()
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
      await load()
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
      await load()
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
      await load()
      setNotice('This student result has been unpublished.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  if (!assessment) return <div>{error ? <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : <div className="h-80 animate-pulse rounded-2xl bg-slate-200/60" />}</div>
  const stats = assessment.stats
  const missingObjectiveKeys = assessment.questions.filter(question => (
    question.question_type === 'MCQ' && !['A', 'B', 'C', 'D'].includes(question.answer_key?.correct_answer?.trim().toUpperCase())
  ) || (
    question.question_type === 'FILLUP' && !question.answer_key?.correct_answer?.trim()
  )).length
  const canPublishAll = attempts.length > 0 && attempts.every(isAttemptFullyEvaluated) && attempts.some(isAttemptPublishable)

  return <div className="mx-auto max-w-6xl"><Link to={`/assessments/${assessment.id}`} className="back-link"><ArrowLeft size={16} />Assessment</Link>
    <div className="mt-6 flex flex-col justify-between gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end"><div><p className="eyebrow">Teacher dashboard{assessment.archived ? ' · Archived' : ''}</p><h1 className="page-title mt-2">{assessment.title}</h1><p className="mt-2 text-sm text-slate-500">Review answer keys, evaluate submissions, and publish results.</p></div><div className="flex flex-wrap gap-2"><button disabled={busy || assessment.archived} onClick={() => action('status', () => api.put(`/assessments/${assessment.id}`, { is_published: true, is_accepting_responses: !assessment.is_accepting_responses }))} className="btn-secondary">{assessment.is_accepting_responses ? <Lock size={15} /> : <Eye size={15} />}{assessment.is_accepting_responses ? 'Close responses' : 'Open responses'}</button><button disabled={busy || !stats.pending_count || missingObjectiveKeys > 0} onClick={() => action('evaluate', () => api.post(`/assessments/${assessment.id}/evaluate`))} className="btn-secondary"><ClipboardCheck size={15} />{busy === 'evaluate' ? 'Evaluating…' : 'Evaluate pending'}</button><button disabled={busy || !canPublishAll || assessment.archived} onClick={publishAllEvaluated} className="btn-primary" title={!canPublishAll ? 'Available after every submitted student is fully evaluated.' : undefined}><Send size={15} />{busy === 'publish-all' ? 'Publishing…' : 'Publish All Results'}</button></div></div>
    {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Class students" value={stats.total_students} icon={<Users size={16} />} /><Stat label="Submitted" value={stats.submitted_count} /><Stat label="Pending" value={stats.pending_count} /><Stat label="Evaluated" value={stats.evaluated_count} /><Stat label="Published" value={stats.published_count} icon={<CheckCircle2 size={16} />} /></div>
    <div className="mt-7 flex gap-1 overflow-x-auto border-b border-slate-200"><Tab active={tab === 'question-paper'} onClick={() => setTab('question-paper')}>Question Paper</Tab><Tab active={tab === 'answer-key'} onClick={() => setTab('answer-key')}>Answer Key</Tab><Tab active={tab === 'attempts'} onClick={() => setTab('attempts')}>Attempts ({attempts.length})</Tab><Tab active={tab === 'evaluation'} onClick={() => setTab('evaluation')}>Evaluation</Tab><Tab active={tab === 'results'} onClick={() => setTab('results')}>Results</Tab><Tab active={tab === 'templates'} onClick={() => setTab('templates')}>Templates</Tab></div>
    {tab === 'question-paper' && <QuestionPaper assessment={preview || assessment} />}
    {tab === 'answer-key' && <AnswerKey questions={assessment.questions} onImport={handleAnswerKeyImport} importing={busy === 'answer-key-import'} />}
    {tab === 'attempts' && <AttemptsSummary attempts={attempts} onEvaluate={() => setTab('evaluation')} />}
    {tab === 'evaluation' && <EvaluationPanel attempts={attempts} onSaved={load} onImport={handleAnswerKeyImport} evaluate={() => action('evaluate', () => api.post(`/assessments/${assessment.id}/evaluate`))} publishAll={publishAllEvaluated} publishAttempt={publishAttempt} unpublishAttempt={unpublishAttempt} viewResults={() => setTab('results')} busy={busy} missingObjectiveKeys={missingObjectiveKeys} canPublishAll={canPublishAll} />}
    {tab === 'results' && <Results attempts={attempts} publishAttempt={publishAttempt} unpublishAttempt={unpublishAttempt} viewAttempt={() => setTab('evaluation')} busy={busy} />}
    {tab === 'templates' && <TemplatesPanel />}
  </div>
}

function Stat({ label, value, icon }) { return <div className="card p-4"><p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">{icon}{label}</p><p className="mt-2 text-2xl font-bold text-slate-950">{value}</p></div> }
function Tab({ active, onClick, children }) { return <button onClick={onClick} className={`border-b-2 px-4 py-3 text-sm font-semibold ${active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>{children}</button> }

function QuestionPaper({ assessment }) {
  return <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
    <header className="border-b border-slate-200 bg-slate-50 px-5 py-5 sm:px-7"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-brand-700">Question paper</p><h2 className="mt-1 text-xl font-bold text-slate-950">{assessment.title}</h2><p className="mt-1 text-sm text-slate-500">{assessmentTimingLabel(assessment)} · {assessment.question_count} questions</p></div><span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><Eye size={14} />Student preview - answers are hidden</span></div></header>
    <div className="divide-y divide-slate-200">{assessment.questions.map((question, index) => <PreviewQuestion key={question.id} question={question} index={index} />)}</div>
    {!assessment.questions.length && <div className="empty-state m-5">No questions have been imported yet.</div>}
  </section>
}

function PreviewQuestion({ question, index }) {
  return <article className="px-5 py-6 sm:px-7"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-brand-700">Question {index + 1} · {question.question_type} · {question.marks} {question.marks === 1 ? 'mark' : 'marks'}</p>{(question.difficulty || question.tags) && <span className="text-xs text-slate-400">{question.difficulty}{question.difficulty && question.tags ? ' · ' : ''}{question.tags}</span>}</div><h3 className="mt-3 font-semibold leading-7 text-slate-900">{question.question_text}</h3>
    {question.question_type === 'MCQ' && <div className="mt-4 grid gap-2 sm:grid-cols-2">{[['A', question.option_a], ['B', question.option_b], ['C', question.option_c], ['D', question.option_d]].map(([letter, option]) => <div key={letter} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm text-slate-700"><span className="grid size-6 shrink-0 place-items-center rounded-full border border-slate-300 bg-white text-xs font-bold text-slate-600">{letter}</span><span className="pt-0.5 leading-5">{option}</span></div>)}</div>}
    {question.question_type === 'FILLUP' && <div className="mt-5 h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-400">Student answer</div>}
    {question.question_type === 'CODING' && <div className="mt-4 space-y-3">{question.starter_code && <PreviewCode label="Starter code" value={question.starter_code} />}{question.visible_test_cases && <PreviewCode label="Visible test cases" value={question.visible_test_cases} />}{question.expected_output && <PreviewCode label="Expected output" value={question.expected_output} />}{!question.starter_code && !question.visible_test_cases && !question.expected_output && <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500"><FileCode2 size={18} className="mb-2" />Students will write their code response here.</div>}</div>}
  </article>
}

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

function Results({ attempts, publishAttempt, unpublishAttempt, viewAttempt, busy }) {
  if (!attempts.length) return <div className="empty-state mt-5">No assessment results are available yet.</div>
  return <section className="card mt-5 overflow-hidden"><header className="border-b border-slate-200 bg-slate-50 px-5 py-4"><h2 className="font-bold text-slate-900">Result overview</h2><p className="mt-1 text-xs text-slate-500">Each student sees their result only after that attempt is published.</p></header><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Score</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Percentage</th><th className="px-4 py-3">Evaluation</th><th className="px-4 py-3">Publish status</th><th className="px-4 py-3">Published at</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{attempts.map(attempt => <tr key={attempt.id}><td className="px-4 py-4 font-semibold">{attempt.student_name}</td><td className="px-4 py-4 text-slate-500">{attempt.student_email}</td><td className="px-4 py-4 font-bold">{attempt.score}</td><td className="px-4 py-4">{attempt.total_marks}</td><td className="px-4 py-4 font-semibold">{attempt.total_marks ? Math.round(attempt.score / attempt.total_marks * 100) : 0}%</td><td className="px-4 py-4 capitalize text-slate-600">{attempt.status === 'published' ? 'Evaluated' : attempt.status.replaceAll('_', ' ')}</td><td className="px-4 py-4 font-semibold">{publishStatus(attempt)}</td><td className="px-4 py-4 text-slate-500">{attempt.published_at ? new Date(attempt.published_at).toLocaleString() : '—'}</td><td className="px-4 py-4"><div className="flex flex-wrap gap-2"><button onClick={viewAttempt} className="btn-secondary">View</button>{attempt.status !== 'published' && <button disabled={busy === `publish-${attempt.id}` || !isAttemptPublishable(attempt)} title={publishHelpText(attempt)} onClick={() => publishAttempt(attempt.id)} className="btn-secondary">{busy === `publish-${attempt.id}` ? 'Publishing…' : 'Publish'}</button>}{attempt.status === 'published' && <button disabled={busy === `unpublish-${attempt.id}`} onClick={() => unpublishAttempt(attempt.id)} className="btn-secondary">{busy === `unpublish-${attempt.id}` ? 'Unpublishing…' : 'Unpublish'}</button>}</div></td></tr>)}</tbody></table></div></section>
}

function AttemptsSummary({ attempts, onEvaluate }) {
  if (!attempts.length) return <div className="empty-state mt-5">No students have submitted this assessment.</div>
  return <div className="card mt-5 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Student name</th><th className="px-5 py-3">Email</th><th className="px-5 py-3">Submitted at</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Score</th><th className="px-5 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{attempts.map(attempt => <tr key={attempt.id}><td className="px-5 py-4 font-semibold">{attempt.student_name}</td><td className="px-5 py-4 text-slate-500">{attempt.student_email}</td><td className="px-5 py-4 text-slate-500">{new Date(attempt.submitted_at).toLocaleString()}</td><td className="px-5 py-4 capitalize">{attempt.status.replaceAll('_', ' ')}</td><td className="px-5 py-4 font-semibold">{attempt.score}/{attempt.total_marks}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-2"><button onClick={onEvaluate} className="btn-secondary">View Attempt</button><button onClick={onEvaluate} className="btn-secondary">Evaluate</button><button onClick={onEvaluate} className="btn-secondary">Edit Marks</button></div></td></tr>)}</tbody></table></div></div>
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

function EvaluationPanel({ attempts, onSaved, onImport, evaluate, publishAll, publishAttempt, unpublishAttempt, viewResults, busy, missingObjectiveKeys, canPublishAll }) {
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
  return <div className="mt-5"><div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-800">Evaluation does not publish results automatically. Review marks before publishing.</p>{missingObjectiveKeys > 0 && <p className="mt-2 text-sm font-semibold text-red-700">Some MCQ/FILLUP questions are missing answer keys. Import answer key before evaluation.</p>}<div className="mt-3 flex flex-wrap gap-2"><AnswerKeyImportButton onImport={onImport} importing={busy === 'answer-key-import'} /><button onClick={evaluate} disabled={busy === 'evaluate' || missingObjectiveKeys > 0} className="btn-secondary"><ClipboardCheck size={15} />{busy === 'evaluate' ? 'Evaluating…' : 'Evaluate Pending Submissions'}</button><button disabled className="btn-secondary"><Download size={15} />Export Evaluation Workbook</button><button onClick={publishAll} disabled={busy === 'publish-all' || !canPublishAll} title={!canPublishAll ? 'Available after every submitted student is fully evaluated.' : undefined} className="btn-primary"><Send size={15} />{busy === 'publish-all' ? 'Publishing…' : 'Publish All Results'}</button></div>{attempts.length > 0 && !canPublishAll && <p className="mt-2 text-xs font-semibold text-amber-700">Publish All Results unlocks after every submitted student has marks for every question. Use each student’s publish button when only one result is ready.</p>}</div><div className="mb-4 flex flex-wrap gap-2">{filters.map(([value, label, count]) => <button type="button" key={value} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${filter === value ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{label} <span className={filter === value ? 'text-brand-100' : 'text-slate-400'}>{count}</span></button>)}</div><Attempts attempts={attempts} onSaved={onSaved} filter={filter} publishAttempt={publishAttempt} unpublishAttempt={unpublishAttempt} viewResults={viewResults} busy={busy} /></div>
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

function Attempts({ attempts, onSaved, filter = 'all', publishAttempt, unpublishAttempt, viewResults, busy }) {
  if (!attempts.length) return <div className="empty-state mt-5">No students have submitted this assessment.</div>
  const visibleAttempts = attempts.map(attempt => ({
    ...attempt,
    visibleResponses: filter === 'all' ? attempt.responses : attempt.responses.filter(response => getResponseStatus(response) === filter),
  })).filter(attempt => attempt.visibleResponses.length)
  if (!visibleAttempts.length) return <div className="empty-state mt-5">No responses match this filter.</div>
  return <div className="mt-5 space-y-4">{visibleAttempts.map(attempt => <AttemptEvaluationCard key={`${attempt.id}-${attempt.responses.map(response => `${response.id}:${response.awarded_marks}:${response.feedback || ''}`).join('|')}`} attempt={attempt} onSaved={onSaved} publishAttempt={publishAttempt} unpublishAttempt={unpublishAttempt} viewResults={viewResults} busy={busy} />)}</div>
}

function AttemptEvaluationCard({ attempt, onSaved, publishAttempt, unpublishAttempt, viewResults, busy }) {
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
  return <article className="card overflow-hidden"><header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-4"><div><h3 className="font-bold">{attempt.student_name}</h3><p className="mt-0.5 text-xs text-slate-500">Submitted {new Date(attempt.submitted_at).toLocaleString()}</p><div className="mt-2 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-white px-2.5 py-1 font-bold capitalize text-slate-600">Status: {attempt.status === 'published' ? 'evaluated' : attempt.status.replaceAll('_', ' ')}</span><span className={`rounded-full px-2.5 py-1 font-bold ${attempt.status === 'published' ? 'bg-emerald-100 text-emerald-700' : isAttemptPublishable(attempt) ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>Result: {attempt.status === 'published' ? 'Published' : isAttemptPublishable(attempt) ? 'Ready to Publish' : 'Not Published'}</span></div>{attempt.published_at && <p className="mt-2 text-xs text-slate-500">Published {new Date(attempt.published_at).toLocaleString()}</p>}</div><div className="flex flex-col items-end gap-2"><p className="text-sm font-bold">{attempt.score}/{attempt.total_marks}</p><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={viewResults} className="btn-secondary">View Result Preview</button>{attempt.status !== 'published' && <button type="button" disabled={saving} onClick={saveAll} className="btn-secondary"><Save size={15} />{saving ? 'Saving…' : 'Save All Marks'}</button>}{attempt.status !== 'published' && <button type="button" disabled={busy === `publish-${attempt.id}` || !isAttemptPublishable(attempt)} title={publishHelpText(attempt)} onClick={() => publishAttempt(attempt.id)} className="btn-primary">{busy === `publish-${attempt.id}` ? 'Publishing…' : 'Publish This Result'}</button>}{attempt.status === 'published' && <button type="button" disabled={busy === `unpublish-${attempt.id}`} onClick={() => unpublishAttempt(attempt.id)} className="btn-secondary">{busy === `unpublish-${attempt.id}` ? 'Unpublishing…' : 'Unpublish Result'}</button>}</div>{attempt.status !== 'published' && !isAttemptPublishable(attempt) && <p className="max-w-sm text-right text-xs font-semibold text-amber-700">{publishHelpText(attempt)}</p>}</div>{saveError && <p className="basis-full rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}</header><div className="divide-y divide-slate-100">{attempt.visibleResponses.map(response => <ResponseEditor key={response.id} response={response} draft={drafts[response.id] || { marks: response.awarded_marks, feedback: response.feedback || '' }} disabled={disabled || saving} onDraftChange={changes => updateDraft(response.id, changes)} />)}</div></article>
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
