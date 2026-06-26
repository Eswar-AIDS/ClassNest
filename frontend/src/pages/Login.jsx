import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../api/axios'
import AuthShell from './AuthShell'
import { ButtonLoader } from '../components/common/Loading'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.from || sessionStorage.getItem('classnest_return_to')

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(form)
      sessionStorage.removeItem('classnest_return_to')
      navigate(returnTo || '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <AuthShell title="Welcome back" subtitle="Sign in to continue teaching, learning, and keeping every classroom organized." footer={<>New to ClassNest? <Link className="auth-link" to="/register" state={{ from: returnTo }}>Create an account</Link></>}>
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="auth-error">{error}</p>}
      <label><span className="auth-label">Email address</span><input className="auth-field" type="email" required autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
      <label><span className="auth-label">Password</span><input className="auth-field" type="password" required autoComplete="current-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label>
      <button disabled={busy} className="auth-button w-full">{busy ? <ButtonLoader label="Signing in..." /> : 'Sign in'}</button>
    </form>
  </AuthShell>
}
