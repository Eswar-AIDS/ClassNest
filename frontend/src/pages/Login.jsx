import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../api/axios'
import AuthShell from './AuthShell'

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

  return <AuthShell title="Welcome back" subtitle="Sign in to continue to your classrooms." footer={<>New to ClassNest? <Link className="font-semibold text-brand-600" to="/register" state={{ from: returnTo }}>Create an account</Link></>}>
    <form onSubmit={submit} className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label><span className="label">Email address</span><input className="field" type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })}/></label>
      <label><span className="label">Password</span><input className="field" type="password" required value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label>
      <button disabled={busy} className="btn-primary w-full">{busy ? 'Signing in…' : 'Sign in'}</button>
      <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Demo teacher: teacher@classnest.com / teacher123<br/>Demo student: student@classnest.com / student123</div>
    </form>
  </AuthShell>
}
