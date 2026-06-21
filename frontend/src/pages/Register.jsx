import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../api/axios'
import AuthShell from './AuthShell'

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.from || sessionStorage.getItem('classnest_return_to')

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await register(form)
      sessionStorage.removeItem('classnest_return_to')
      navigate(returnTo || '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <AuthShell title="Create your account" subtitle="Your role adapts to each classroom you join." footer={<>Already have an account? <Link className="font-semibold text-brand-600" to="/login" state={{ from: returnTo }}>Sign in</Link></>}>
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label><span className="label">Full name</span><input className="field" required minLength="2" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label>
      <label><span className="label">Email address</span><input className="field" type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
      <label><span className="label">Password</span><input className="field" type="password" required minLength="8" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label>
      <button disabled={busy} className="btn-primary w-full">{busy ? 'Creating account…' : 'Create account'}</button>
    </form>
  </AuthShell>
}
