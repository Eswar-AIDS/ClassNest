import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, FileSpreadsheet, Upload } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import { downloadAnswerKeyEvaluationTemplate, downloadAssessmentImportTemplate } from '../api/templates'
import AssessmentTimingFields from '../components/AssessmentTimingFields'
import { timingPayload } from '../utils/assessmentTiming'

export default function CreateAssessment() {
  const { unitId } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', description: '', timing_mode: 'untimed', duration_minutes: 30, starts_at: '', ends_at: '' })
  const [file, setFile] = useState(null)
  const [openAfterUpload, setOpenAfterUpload] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draftId, setDraftId] = useState(null)

  const submit = async event => {
    event.preventDefault()
    if (!file || !file.name.toLowerCase().endsWith('.xlsx')) {
      setError('Choose a valid .xlsx assessment file.')
      return
    }
    setBusy(true)
    setError('')
    try {
      let assessmentId = draftId
      if (!assessmentId) {
        const created = await api.post(`/units/${unitId}/assessments`, timingPayload(form))
        assessmentId = created.data.id
        setDraftId(assessmentId)
      }
      const data = new FormData()
      data.append('file', file)
      await api.post(`/assessments/${assessmentId}/upload-excel`, data)
      if (openAfterUpload) await api.put(`/assessments/${assessmentId}`, { is_published: true, is_accepting_responses: true })
      navigate(`/assessments/${assessmentId}/dashboard`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return <div className="mx-auto max-w-2xl">
    <button onClick={() => navigate(-1)} className="back-link"><ArrowLeft size={16} />Back</button>
    <div className="card mt-6 p-6 sm:p-8"><h1 className="page-title">Create assessment</h1><p className="mt-2 text-sm leading-6 text-slate-500">Add assessment details and import MCQ, fill-up, and coding questions from Excel.</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-bold text-slate-900">Templates</p><p className="mt-1 text-xs leading-5 text-slate-500">Use the question template to prepare import-ready assessments. Use the evaluation template to review answer keys, student responses, and result summaries.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={downloadAssessmentImportTemplate} className="btn-secondary"><Download size={15} />Download Question Import Template</button><button type="button" onClick={downloadAnswerKeyEvaluationTemplate} className="btn-secondary"><Download size={15} />Download Answer Key / Evaluation Template</button></div></section>
        <label><span className="label">Assessment title</span><input className="field" required maxLength="200" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label><span className="label">Description</span><textarea className="field resize-y" rows="4" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
        <AssessmentTimingFields form={form} setForm={setForm} />
        <div><span className="label">Question workbook</span><label className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 hover:border-brand-500 hover:bg-brand-50/40"><span className="grid size-11 place-items-center rounded-lg bg-white text-emerald-700 shadow-sm"><FileSpreadsheet size={22} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{file?.name || 'Choose an .xlsx file'}</p><p className="mt-1 text-xs text-slate-500">Maximum file size: 10 MB</p></div><Upload size={18} className="text-slate-400" /><input className="sr-only" type="file" accept=".xlsx" required onChange={event => setFile(event.target.files?.[0] || null)} /></label></div>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" checked={openAfterUpload} onChange={event => setOpenAfterUpload(event.target.checked)} className="mt-0.5 size-4 rounded border-slate-300 text-brand-600" /><span><span className="block text-sm font-semibold text-slate-800">Open to students after import</span><span className="mt-1 block text-xs leading-5 text-slate-500">Leave unchecked to review the answer key before opening responses.</span></span></label>
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button><button disabled={busy} className="btn-primary">{busy ? 'Importing…' : 'Create assessment'}</button></div>
      </form>
    </div>
  </div>
}
