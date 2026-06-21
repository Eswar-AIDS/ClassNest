import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Eye, Mail, Search, Send, Users, XCircle } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

const MODES = [
  ['all_students', 'All students'],
  ['selected_students', 'Selected students'],
  ['not_attempted_assessment', 'Not attempted assessment'],
  ['pending_evaluation', 'Pending evaluation'],
  ['result_published', 'Result published'],
  ['below_score_threshold', 'Below score threshold'],
]
const ASSESSMENT_MODES = new Set(['not_attempted_assessment', 'pending_evaluation', 'result_published', 'below_score_threshold'])
const TEMPLATES = {
  material: { label: 'New Material Uploaded', subject: 'New material uploaded in {{class_name}}', message: 'Hello {{student_name}},\n\nA new learning material has been uploaded in {{class_name}}.\nPlease check your ClassNest dashboard.\n\n{{teacher_name}}' },
  opened: { label: 'Assessment Opened', subject: 'New assessment opened: {{assessment_title}}', message: 'Hello {{student_name}},\n\nA new assessment "{{assessment_title}}" is now open in {{class_name}}.\nPlease complete it before the deadline.\n\n{{teacher_name}}' },
  reminder: { label: 'Assessment Reminder', subject: 'Reminder: Complete {{assessment_title}}', message: 'Hello {{student_name}},\n\nThis is a reminder to complete "{{assessment_title}}" in {{class_name}}.\n\n{{teacher_name}}' },
  results: { label: 'Results Published', subject: 'Results published for {{assessment_title}}', message: 'Hello {{student_name}},\n\nYour result for "{{assessment_title}}" has been published.\nLogin to ClassNest to view your score and feedback.\n\n{{teacher_name}}' },
}

export default function EmailNotificationPage() {
  const { classId } = useParams()
  const [room, setRoom] = useState(null)
  const [students, setStudents] = useState([])
  const [assessments, setAssessments] = useState([])
  const [history, setHistory] = useState([])
  const [form, setForm] = useState({ recipient_mode: 'all_students', selected_student_ids: [], assessment_id: '', below_score_threshold: 40, subject: '', message_body: '' })
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [details, setDetails] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const loadHistory = () => api.get(`/classrooms/${classId}/notifications/email/history`).then(response => setHistory(response.data))
  useEffect(() => {
    Promise.all([api.get(`/classrooms/${classId}`), api.get(`/classrooms/${classId}/members`), api.get(`/classrooms/${classId}/units`), api.get(`/classrooms/${classId}/notifications/email/history`)]).then(async ([classroom, members, units, sentHistory]) => {
      const assessmentResponses = await Promise.all(units.data.map(unit => api.get(`/units/${unit.id}/assessments`)))
      setRoom(classroom.data)
      setStudents(members.data.filter(member => member.role === 'student'))
      setAssessments(assessmentResponses.flatMap((response, index) => response.data.filter(item => !item.archived).map(item => ({ ...item, unit_title: units.data[index].title }))))
      setHistory(sentHistory.data)
    }).catch(err => setError(errorMessage(err)))
  }, [classId])

  const payload = () => ({
    ...form,
    assessment_id: ASSESSMENT_MODES.has(form.recipient_mode) ? Number(form.assessment_id) || null : null,
    below_score_threshold: form.recipient_mode === 'below_score_threshold' ? Number(form.below_score_threshold) : null,
  })
  const previewRecipients = async () => {
    setBusy('preview'); setError(''); setResult(null)
    try { const { data } = await api.post(`/classrooms/${classId}/notifications/email/preview`, payload()); setPreview(data) }
    catch (err) { setError(errorMessage(err)); setPreview(null) }
    finally { setBusy('') }
  }
  const send = async () => {
    if (!window.confirm('Send this email notification to the selected students?')) return
    setBusy('send'); setError('')
    try {
      const { data } = await api.post(`/classrooms/${classId}/notifications/email/send`, payload())
      setResult(data); await loadHistory()
    } catch (err) { setError(errorMessage(err)) }
    finally { setBusy('') }
  }
  const applyTemplate = key => {
    const template = TEMPLATES[key]
    if (template) setForm(current => ({ ...current, subject: template.subject, message_body: template.message }))
  }
  const toggleStudent = id => setForm(current => ({ ...current, selected_student_ids: current.selected_student_ids.includes(id) ? current.selected_student_ids.filter(item => item !== id) : [...current.selected_student_ids, id] }))
  const visibleStudents = useMemo(() => students.filter(student => `${student.name} ${student.email}`.toLowerCase().includes(search.toLowerCase())), [search, students])
  const openDetails = async id => {
    try { const { data } = await api.get(`/notifications/email/${id}`); setDetails(data) }
    catch (err) { setError(errorMessage(err)) }
  }

  if (!room && !error) return <div className="h-72 animate-pulse rounded-2xl bg-slate-200/60" />
  if (!room && error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (room?.role !== 'teacher') return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Teacher access required.</p>
  return <div className="mx-auto max-w-5xl">
    <Link to={`/classes/${classId}`} className="back-link"><ArrowLeft size={17} />Back to class</Link>
    <div className="mt-6 flex items-start gap-3"><span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><Mail size={21} /></span><div><h1 className="page-title">Send Email Notification</h1><p className="mt-1 text-sm text-slate-500">Send a custom message to students in {room?.name}.</p></div></div>
    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {result && <div className={`mt-5 rounded-xl border p-4 ${result.failed ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}><p className="font-bold">Delivery complete: {result.sent} sent, {result.failed} failed.</p>{result.error_message && <p className="mt-1 text-sm">{result.error_message}</p>}<a href="#email-history" className="mt-2 inline-block text-sm font-semibold underline">View email history</a></div>}

    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <section className="card p-5 sm:p-6"><h2 className="font-bold">Recipients</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="label">Recipient group</span><select className="field" value={form.recipient_mode} onChange={event => { setForm({ ...form, recipient_mode: event.target.value, selected_student_ids: [] }); setPreview(null) }}>{MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{ASSESSMENT_MODES.has(form.recipient_mode) && <label><span className="label">Assessment</span><select className="field" required value={form.assessment_id} onChange={event => setForm({ ...form, assessment_id: event.target.value })}><option value="">Select assessment</option>{assessments.map(item => <option key={item.id} value={item.id}>{item.unit_title} — {item.title}</option>)}</select></label>}{form.recipient_mode === 'below_score_threshold' && <label><span className="label">Below percentage</span><input className="field" type="number" min="0" max="100" value={form.below_score_threshold} onChange={event => setForm({ ...form, below_score_threshold: event.target.value })} /></label>}</div>
          {form.recipient_mode === 'selected_students' && <div className="mt-4 rounded-xl border border-slate-200"><div className="flex items-center gap-2 border-b border-slate-200 p-3"><Search size={16} className="text-slate-400" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search students" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="max-h-64 divide-y divide-slate-100 overflow-y-auto">{visibleStudents.map(student => <label key={student.user_id} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50"><input type="checkbox" checked={form.selected_student_ids.includes(student.user_id)} onChange={() => toggleStudent(student.user_id)} /><span><span className="block text-sm font-semibold">{student.name}</span><span className="text-xs text-slate-500">{student.email}</span></span></label>)}{!visibleStudents.length && <p className="p-4 text-sm text-slate-500">No students found.</p>}</div></div>}
        </section>
        <section className="card p-5 sm:p-6"><h2 className="font-bold">Message</h2><div className="mt-4 space-y-4"><label><span className="label">Quick template</span><select className="field" defaultValue="" onChange={event => applyTemplate(event.target.value)}><option value="">Write a custom email</option>{Object.entries(TEMPLATES).map(([key, template]) => <option key={key} value={key}>{template.label}</option>)}</select></label><label><span className="label">Subject</span><input className="field" required maxLength="200" value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} /></label><label><span className="label">Message</span><textarea className="field min-h-56 resize-y" required maxLength="20000" value={form.message_body} onChange={event => setForm({ ...form, message_body: event.target.value })} /></label><p className="text-xs leading-5 text-slate-500">Variables: {'{{student_name}}'}, {'{{class_name}}'}, {'{{assessment_title}}'}, {'{{unit_title}}'}, {'{{teacher_name}}'}</p></div></section>
        <div className="flex flex-wrap justify-end gap-2"><Link className="btn-secondary" to={`/classes/${classId}`}>Cancel</Link><button disabled={Boolean(busy)} onClick={previewRecipients} className="btn-secondary"><Eye size={16} />{busy === 'preview' ? 'Loading…' : 'Preview Recipients'}</button><button disabled={Boolean(busy)} onClick={send} className="btn-primary"><Send size={16} />{busy === 'send' ? 'Sending…' : 'Send Email'}</button></div>
      </div>

      <aside className="card h-fit overflow-hidden lg:sticky lg:top-24"><div className="border-b border-slate-200 p-4"><h2 className="font-bold">Email preview</h2><p className="mt-1 text-xs text-slate-500">Template variables are personalized for each student.</p></div>{preview ? <div><div className="border-b border-slate-100 p-4"><p className="text-xs font-bold uppercase text-slate-400">Recipients ({preview.recipient_count})</p><div className="mt-2 max-h-40 space-y-2 overflow-y-auto">{preview.recipients.map(recipient => <div key={recipient.user_id} className="text-sm"><b>{recipient.name}</b><p className="text-xs text-slate-500">{recipient.email}</p></div>)}</div></div><div className="p-4"><p className="text-xs font-bold uppercase text-slate-400">Subject</p><p className="mt-1 font-semibold">{preview.subject}</p><p className="mt-4 text-xs font-bold uppercase text-slate-400">Message</p><pre className="mt-1 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{preview.message_body}</pre></div></div> : <div className="p-8 text-center text-sm text-slate-500"><Users className="mx-auto mb-3 text-slate-300" />Preview recipients before sending.</div>}</aside>
    </div>

    <section id="email-history" className="card mt-8 overflow-hidden"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold">Email history</h2></div><div className="overflow-x-auto"><table className="w-full min-w-max text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Recipients</th><th className="px-5 py-3">Mode</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Sent</th><th /></tr></thead><tbody className="divide-y divide-slate-100">{history.map(item => <tr key={item.id}><td className="px-5 py-4 font-semibold">{item.subject}</td><td className="px-5 py-4">{item.recipient_count}</td><td className="px-5 py-4 capitalize text-slate-500">{item.recipient_mode.replaceAll('_', ' ')}</td><td className="px-5 py-4"><DeliveryStatus value={item.status} /></td><td className="px-5 py-4 text-slate-500">{formatDate(item.sent_at || item.created_at)}</td><td className="px-5 py-4"><button onClick={() => openDetails(item.id)} className="font-semibold text-brand-700">Details</button></td></tr>)}{!history.length && <tr><td colSpan="6" className="p-10 text-center text-slate-500">No email notifications sent yet.</td></tr>}</tbody></table></div></section>
    {details && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4"><div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-lift"><div className="flex justify-between gap-4"><div><h2 className="text-lg font-bold">Email Details</h2><p className="mt-1 text-xs text-slate-500">{details.recipient_count} recipients · {formatDate(details.sent_at || details.created_at)}</p></div><button onClick={() => setDetails(null)} className="text-slate-500">Close</button></div><div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">{details.recipients.map(recipient => <div key={recipient.user_id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{recipient.name}</p><p className="text-xs text-slate-500">{recipient.email}</p></div><DeliveryStatus value={recipient.status} /></div><p className="mt-3 text-xs font-bold uppercase text-slate-400">Subject</p><p className="mt-1 text-sm font-semibold">{recipient.subject}</p><pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-sm leading-6">{recipient.message_body}</pre>{recipient.error_message && <p className="mt-3 text-xs text-red-600">{recipient.error_message}</p>}</div>)}</div></div></div>}
  </div>
}

function DeliveryStatus({ value }) {
  const success = value === 'sent' || value === 'completed'
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold capitalize ${success ? 'bg-emerald-50 text-emerald-700' : value === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{success ? <CheckCircle2 size={13} /> : value === 'failed' ? <XCircle size={13} /> : null}{value}</span>
}
function formatDate(value) { return value ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`).toLocaleString() : '—' }
