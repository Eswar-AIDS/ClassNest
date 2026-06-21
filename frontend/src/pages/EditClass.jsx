import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

export default function EditClass() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', subject: '', description: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/classrooms/${classId}`).then(response => {
      if (response.data.role !== 'teacher') throw new Error('Only the classroom teacher can edit this class.')
      setForm({
        name: response.data.name || '',
        subject: response.data.subject || '',
        description: response.data.description || '',
      })
      setLoading(false)
    }).catch(err => {
      setError(errorMessage(err))
      setLoading(false)
    })
  }, [classId])

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.put(`/classrooms/${classId}`, form)
      navigate(`/classes/${classId}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  if (loading) return <div className="h-72 animate-pulse rounded-2xl bg-slate-200/60" />

  return <div className="mx-auto max-w-2xl">
    <Link to={`/classes/${classId}`} className="back-link"><ArrowLeft size={17} />Back to class</Link>
    <div className="card mt-6 p-6 md:p-8">
      <h1 className="page-title">Edit class</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Update the classroom name, subject, and description shown to members.</p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <label>
          <span className="label">Class name</span>
          <input className="field" required minLength="2" maxLength="160" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
        </label>
        <label>
          <span className="label">Subject</span>
          <input className="field" required minLength="2" maxLength="160" value={form.subject} onChange={event => setForm({ ...form, subject: event.target.value })} />
        </label>
        <label>
          <span className="label">Description</span>
          <textarea className="field resize-y" rows="5" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => navigate(`/classes/${classId}`)} className="btn-secondary">Cancel</button>
          <button disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </div>
  </div>
}
