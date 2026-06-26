import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../api/axios'
import AuthShell from './AuthShell'
import { ButtonLoader } from '../components/common/Loading'

const SREC_EMAIL_ERROR = 'Use your official SREC email address ending with @srec.ac.in'
const SREC_EMAIL_RE = /^[A-Za-z0-9._%+-]+@srec\.ac\.in$/

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
    const email = form.email.trim().toLowerCase()
    if (!email.endsWith('@srec.ac.in') || !SREC_EMAIL_RE.test(email)) {
      setError(SREC_EMAIL_ERROR)
      setForm(current => ({ ...current, email }))
      return
    }
    setBusy(true)
    setError('')
    try {
      await register({ ...form, email })
      sessionStorage.removeItem('classnest_return_to')
      navigate(returnTo || '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <AuthShell title="Create your account" subtitle="Start a calmer classroom workspace for lessons, materials, and assessments." footer={<>Already have an account? <Link className="auth-link" to="/login" state={{ from: returnTo }}>Sign in</Link></>}>
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="auth-error">{error}</p>}
      <label><span className="auth-label">Full name</span><input className="auth-field" required minLength="2" autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label>
      <label><span className="auth-label">Email address</span><input className="auth-field" type="email" required autoComplete="email" value={form.email} onBlur={() => setForm(current => ({ ...current, email: current.email.trim().toLowerCase() }))} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
      <label><span className="auth-label">Password</span><input className="auth-field" type="password" required minLength="8" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label>
      <button disabled={busy} className="auth-button w-full">{busy ? <ButtonLoader label="Creating account..." /> : 'Create account'}</button>
    </form>
  </AuthShell>
}
