import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Download, ExternalLink, File, FileImage, FileSpreadsheet, FileText, Trash2 } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

export default function MaterialReader() {
  const { materialId } = useParams()
  const [item, setItem] = useState(null)
  const [role, setRole] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/materials/${materialId}`).then(async response => {
      setItem(response.data)
      const unit = await api.get(`/units/${response.data.unit_id}`)
      const classroom = await api.get(`/classrooms/${unit.data.classroom_id}`)
      setRole(classroom.data.role)
    }).catch(err => setError(errorMessage(err)))
  }, [materialId])

  const removeAttachment = async attachment => {
    if (!confirm(`Delete ${attachment.file_name}?`)) return
    try {
      await api.delete(`/materials/${materialId}/attachments/${attachment.id}`)
      setItem(current => ({ ...current, attachments: current.attachments.filter(file => file.id !== attachment.id) }))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (error && !item) return <div className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
  if (!item) return <div className="mx-auto h-72 max-w-4xl animate-pulse rounded-2xl bg-slate-200/60" />

  return <div className="mx-auto max-w-[900px]">
    <Link to={`/units/${item.unit_id}`} className="back-link"><ArrowLeft size={16} />Back to unit</Link>
    {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <article className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <header className="border-b border-slate-200 px-5 py-6 sm:px-8 sm:py-8 md:px-12">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.13em] text-brand-700"><FileText size={15} />Learning material</div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{item.title}</h1>
        <p className="mt-2 text-sm text-slate-500">Updated {new Date(item.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </header>
      <div className="space-y-8 px-5 py-7 sm:px-8 sm:py-9 md:px-12 md:py-11">
        {item.content_markdown && <div className="prose max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{item.content_markdown}</ReactMarkdown></div>}
        {item.resource_url && <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 sm:flex sm:items-center sm:justify-between sm:gap-5"><div><h2 className="font-bold text-slate-900">External learning resource</h2><p className="mt-1 text-sm leading-6 text-slate-500">This resource opens in a new browser tab.</p></div><a className="btn-secondary mt-4 sm:mt-0" href={item.resource_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Open resource</a></div>}
        {item.attachments.length > 0 && <section>
          <div className="mb-3"><h2 className="section-title">Attachments</h2><p className="mt-1 text-sm text-slate-500">Files shared with this material.</p></div>
          <div className="space-y-2.5">{item.attachments.map(attachment => <AttachmentRow key={attachment.id} materialId={item.id} attachment={attachment} teacher={role === 'teacher'} onDelete={() => removeAttachment(attachment)} />)}</div>
        </section>}
      </div>
    </article>
  </div>
}

function AttachmentRow({ materialId, attachment, teacher, onDelete }) {
  const [thumbnail, setThumbnail] = useState(null)
  const endpoint = `/materials/${materialId}/attachments/${attachment.id}/download`
  const openable = attachment.file_type === 'image' || attachment.file_type === 'pdf'

  useEffect(() => {
    if (attachment.file_type !== 'image') return
    let objectUrl
    api.get(endpoint, { responseType: 'blob' }).then(response => {
      objectUrl = URL.createObjectURL(response.data)
      setThumbnail(objectUrl)
    })
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [attachment.file_type, endpoint])

  const openOrDownload = async () => {
    const response = await api.get(endpoint, { responseType: 'blob' })
    const objectUrl = URL.createObjectURL(response.data)
    if (openable) {
      window.open(objectUrl, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    } else {
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = attachment.file_name
      anchor.click()
      URL.revokeObjectURL(objectUrl)
    }
  }

  return <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
    {thumbnail ? <img src={thumbnail} alt="" className="size-11 shrink-0 rounded-lg border border-slate-200 object-cover" /> : <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${iconStyle(attachment.file_type)}`}>{fileIcon(attachment.file_type)}</span>}
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800">{attachment.file_name}</p><p className="mt-0.5 text-xs capitalize text-slate-500">{attachment.file_type} · {formatFileSize(attachment.file_size)}</p></div>
    <div className="flex items-center gap-1">
      <button type="button" onClick={openOrDownload} className="btn-secondary px-2.5" title={openable ? 'Open attachment' : 'Download attachment'}><Download size={15} /><span className="hidden sm:inline">{openable ? 'Open' : 'Download'}</span></button>
      {teacher && <button type="button" onClick={onDelete} aria-label={`Delete ${attachment.file_name}`} title="Delete attachment" className="rounded-lg p-2.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>}
    </div>
  </div>
}

function fileIcon(type) {
  if (type === 'image') return <FileImage size={20} />
  if (type === 'excel') return <FileSpreadsheet size={20} />
  if (type === 'word' || type === 'pdf') return <FileText size={20} />
  return <File size={20} />
}

function iconStyle(type) {
  if (type === 'pdf') return 'bg-red-50 text-red-600'
  if (type === 'excel') return 'bg-emerald-50 text-emerald-700'
  if (type === 'word') return 'bg-blue-50 text-blue-700'
  return 'bg-violet-50 text-violet-700'
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
