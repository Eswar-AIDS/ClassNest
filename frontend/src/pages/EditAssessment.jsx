import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileSpreadsheet } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import AssessmentTimingFields from '../components/AssessmentTimingFields'
import { timingPayload } from '../utils/assessmentTiming'

const SUBMISSION_MESSAGE = 'This assessment already has submissions. To change questions, duplicate this assessment or create a new one.'

export default function EditAssessment() {
  const { unitId, assessmentId } = useParams()
  const navigate = useNavigate()
  const [assessment, setAssessment] = useState(null)
  const [attemptCount, setAttemptCount] = useState(0)
  const [form, setForm] = useState({ title: '', description: '', timing_mode: 'untimed', duration_minutes: 30, starts_at: '', ends_at: '', is_published: false, is_accepting_responses: false })
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([api.get(`/assessments/${assessmentId}/teacher`), api.get(`/assessments/${assessmentId}/attempt-count`)])
      .then(([assessmentResponse, countResponse]) => {
        const item = assessmentResponse.data
        if (String(item.unit_id) !== String(unitId)) throw new Error('Assessment does not belong to this unit.')
        setAssessment(item)
        setAttemptCount(countResponse.data.attempt_count)
        setForm({
          title: item.title,
          description: item.description || '',
          timing_mode: item.timing_mode || (item.duration_minutes ? 'timed' : 'untimed'),
          duration_minutes: item.duration_minutes || 30,
          starts_at: toLocalInput(item.starts_at),
          ends_at: toLocalInput(item.ends_at),
          is_published: item.is_published,
          is_accepting_responses: item.is_accepting_responses,
        })
      }).catch(err => setError(errorMessage(err)))
  }, [assessmentId, unitId])

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.put(`/assessments/${assessmentId}`, { ...timingPayload(form), is_published: form.is_published, is_accepting_responses: form.is_accepting_responses })
      if (file) {
        const data = new FormData()
        data.append('file', file)
        await api.post(`/assessments/${assessmentId}/replace-excel`, data)
      }
      navigate(`/units/${unitId}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  if (!assessment && !error) return <div className="h-56 animate-pulse rounded-2xl bg-slate-200/60" />
  const status = assessment?.archived ? 'Archived' : assessment?.results_published ? 'Results Published' : form.is_accepting_responses ? 'Open' : form.is_published ? 'Closed' : 'Draft'
  const locked = assessment?.archived || assessment?.results_published

  return <div className="mx-auto max-w-2xl">
    <button onClick={() => navigate(`/units/${unitId}`)} className="back-link"><ArrowLeft size={16} />Back to unit</button>
    <div className="card mt-6 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4"><h1 className="page-title">Edit assessment</h1>{assessment && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-600">{status}</span>}</div>
      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {assessment && <form onSubmit={submit} className="mt-7 space-y-5">
        <label><span className="label">Assessment title</span><input className="field" required maxLength="200" disabled={assessment.archived} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label><span className="label">Description</span><textarea className="field resize-y" rows="4" disabled={assessment.archived} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
        {attemptCount > 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">This assessment already has attempts. Timing changes may affect students.</p>}
        <AssessmentTimingFields form={form} setForm={setForm} disabled={assessment.archived} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" disabled={locked} checked={form.is_published} onChange={event => setForm(current => ({ ...current, is_published: event.target.checked, is_accepting_responses: event.target.checked ? current.is_accepting_responses : false }))} className="mt-0.5 size-4" /><span className="text-sm font-semibold text-slate-800">Published to students</span></label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" disabled={locked || !form.is_published} checked={form.is_accepting_responses} onChange={event => setForm(current => ({ ...current, is_accepting_responses: event.target.checked }))} className="mt-0.5 size-4" /><span className="text-sm font-semibold text-slate-800">Accepting responses</span></label>
        </div>
        <div><span className="label">Replace question workbook</span>{attemptCount > 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">{SUBMISSION_MESSAGE}</p> : <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5"><FileSpreadsheet size={20} className="text-emerald-700" /><span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{file?.name || 'Choose a replacement .xlsx file'}</span><input className="sr-only" type="file" accept=".xlsx" disabled={assessment.archived} onChange={event => setFile(event.target.files?.[0] || null)} /></label>}</div>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => navigate(`/units/${unitId}`)}>Cancel</button><button disabled={busy || assessment.archived} className="btn-primary">{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>}
    </div>
  </div>
}

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
