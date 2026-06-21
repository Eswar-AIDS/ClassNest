import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileUp, Paperclip, Trash2, X } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

const ALLOWED = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.jpg', '.jpeg', '.png', '.webp']
const MAX_SIZE = 10 * 1024 * 1024

export default function EditMaterial() {
  const { classId, unitId, materialId } = useParams()
  const navigate = useNavigate()
  const [material, setMaterial] = useState(null)
  const [form, setForm] = useState({ title: '', content_markdown: '', resource_url: '' })
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([api.get(`/materials/${materialId}`), api.get(`/classrooms/${classId}`)])
      .then(([materialResponse, classroomResponse]) => {
        const item = materialResponse.data
        if (String(item.unit_id) !== String(unitId) || classroomResponse.data.role !== 'teacher') throw new Error('Only the classroom teacher can edit this material.')
        setMaterial(item)
        setForm({ title: item.title, content_markdown: item.content_markdown || '', resource_url: item.resource_url || '' })
      }).catch(err => setError(errorMessage(err)))
  }, [classId, materialId, unitId])

  const selectFiles = event => {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    if (selected.length + files.length + (material?.attachments.length || 0) > 5) return setError('A material can have at most 5 attachments.')
    const invalid = selected.find(file => !ALLOWED.includes(`.${file.name.split('.').pop()?.toLowerCase()}`) || file.size > MAX_SIZE)
    if (invalid) return setError(`${invalid.name} is unsupported or exceeds 10 MB.`)
    setError('')
    setFiles(current => [...current, ...selected])
  }

  const deleteAttachment = async attachment => {
    if (!window.confirm(`Delete ${attachment.file_name}?`)) return
    try {
      await api.delete(`/materials/${materialId}/attachments/${attachment.id}`)
      setMaterial(current => ({ ...current, attachments: current.attachments.filter(item => item.id !== attachment.id) }))
    } catch (err) { setError(errorMessage(err)) }
  }

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.put(`/materials/${materialId}`, {
        title: form.title,
        type: form.content_markdown.trim() ? 'markdown' : 'link',
        content_markdown: form.content_markdown.trim() || null,
        resource_url: form.resource_url.trim() || null,
      })
      if (files.length) {
        const data = new FormData()
        files.forEach(file => data.append('files', file))
        await api.post(`/materials/${materialId}/attachments`, data)
      }
      navigate(`/units/${unitId}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  if (!material && !error) return <div className="h-56 animate-pulse rounded-2xl bg-slate-200/60" />
  return <div className="mx-auto max-w-2xl">
    <button onClick={() => navigate(`/units/${unitId}`)} className="back-link"><ArrowLeft size={16} />Back to unit</button>
    <div className="card mt-6 p-6 sm:p-8">
      <h1 className="page-title">Edit material</h1>
      {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {material && <form onSubmit={submit} className="mt-7 space-y-5">
        <label><span className="label">Title</span><input className="field" required maxLength="200" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label><span className="label">Description / Markdown</span><textarea className="field resize-y" rows="10" value={form.content_markdown} onChange={event => setForm({ ...form, content_markdown: event.target.value })} /></label>
        <label><span className="label">External resource URL <span className="font-normal text-slate-400">(optional)</span></span><input className="field" type="url" value={form.resource_url} onChange={event => setForm({ ...form, resource_url: event.target.value })} /></label>
        <div><span className="label">Existing attachments</span><div className="space-y-2">
          {material.attachments.map(attachment => <div key={attachment.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5"><Paperclip size={16} className="text-slate-400" /><span className="min-w-0 flex-1 truncate text-sm text-slate-700">{attachment.file_name}</span><button type="button" aria-label={`Delete ${attachment.file_name}`} onClick={() => deleteAttachment(attachment)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button></div>)}
          {!material.attachments.length && <p className="text-sm text-slate-500">No attachments.</p>}
        </div></div>
        <div><span className="label">Add attachments</span><label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-700 hover:border-brand-500"><FileUp size={18} />Choose files<input className="sr-only" type="file" multiple accept={ALLOWED.join(',')} onChange={selectFiles} /></label>
          {files.map((file, index) => <div key={`${file.name}-${index}`} className="mt-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{file.name}</span><button type="button" onClick={() => setFiles(current => current.filter((_, itemIndex) => itemIndex !== index))} className="p-1 text-slate-400"><X size={15} /></button></div>)}
        </div>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => navigate(`/units/${unitId}`)}>Cancel</button><button disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save changes'}</button></div>
      </form>}
    </div>
  </div>
}
