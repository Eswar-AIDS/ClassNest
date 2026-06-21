import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileUp, Paperclip, X } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.jpg', '.jpeg', '.png', '.webp']
const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_FILES = 5

export default function CreateMaterial() {
  const { unitId } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', content_markdown: '', resource_url: '' })
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const selectFiles = event => {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    if (selected.length > MAX_FILES) {
      setError(`Choose no more than ${MAX_FILES} attachments.`)
      return
    }
    for (const file of selected) {
      const extension = `.${file.name.split('.').pop()?.toLowerCase()}`
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        setError(`${file.name} is not a supported file type.`)
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} exceeds the 10 MB file-size limit.`)
        return
      }
    }
    setError('')
    setFiles(selected)
  }

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = new FormData()
    data.append('title', form.title)
    data.append('content_markdown', form.content_markdown)
    if (form.resource_url.trim()) data.append('resource_url', form.resource_url.trim())
    files.forEach(file => data.append('files', file))
    try {
      await api.post(`/materials/${unitId}`, data)
      navigate(`/units/${unitId}`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return <div className="mx-auto max-w-2xl">
    <button onClick={() => navigate(-1)} className="back-link"><ArrowLeft size={16} />Back</button>
    <div className="card mt-6 p-6 md:p-8">
      <h1 className="page-title">Add learning material</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Share study notes, a resource link, and supporting files in one post.</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <label><span className="label">Title</span><input className="field" required maxLength="200" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label><span className="label">Description / Markdown</span><textarea className="field resize-y" required rows="10" placeholder="Write clear notes for your students…" value={form.content_markdown} onChange={event => setForm({ ...form, content_markdown: event.target.value })} /></label>
        <label><span className="label">External resource URL <span className="font-normal text-slate-400">(optional)</span></span><input className="field" type="url" placeholder="https://example.com/resource" value={form.resource_url} onChange={event => setForm({ ...form, resource_url: event.target.value })} /></label>

        <div>
          <span className="label">Attachments <span className="font-normal text-slate-400">(optional)</span></span>
          <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center transition hover:border-brand-500 hover:bg-brand-50/40">
            <FileUp size={24} className="text-slate-500" />
            <span className="mt-2 text-sm font-semibold text-slate-800">Choose files</span>
            <span className="mt-1 text-xs leading-5 text-slate-500">PDF, Word, Excel, CSV, or images · up to 5 files · 10 MB each</span>
            <input className="sr-only" type="file" multiple accept={ALLOWED_EXTENSIONS.join(',')} onChange={selectFiles} />
          </label>
          {files.length > 0 && <div className="mt-3 space-y-2">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <Paperclip size={16} className="shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{file.name}</p><p className="text-xs text-slate-500">{formatFileSize(file.size)}</p></div>
            <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(files.filter((_, fileIndex) => fileIndex !== index))} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
          </div>)}</div>}
        </div>

        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => navigate(-1)} className="btn-secondary">Cancel</button><button disabled={busy} className="btn-primary">{busy ? 'Uploading…' : 'Add material'}</button></div>
      </form>
    </div>
  </div>
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
