import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import api, { errorMessage } from '../api/axios'
import AuthShell from './AuthShell'
import { ButtonLoader } from '../components/common/Loading'

const RESET_MESSAGE = 'If an account exists for this email, a reset link has been sent.'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [resetEmail, setResetEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
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

  const sendReset = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.post('/auth/forgot-password', { email: resetEmail.trim().toLowerCase() })
      setNotice(RESET_MESSAGE)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <AuthShell title={mode === 'login' ? 'Welcome back' : 'Reset your password'} subtitle={mode === 'login' ? 'Sign in to continue teaching, learning, and keeping every classroom organized.' : 'Enter your email and we will send a secure reset link if the account exists.'} footer={mode === 'login' ? <>New to ClassNest? <Link className="auth-link" to="/register" state={{ from: returnTo }}>Create an account</Link></> : <button type="button" className="auth-link" onClick={() => { setMode('login'); setError(''); setNotice('') }}>Back to sign in</button>}>
    {mode === 'login' ? <form onSubmit={submit} className="space-y-5">
      {error && <p className="auth-error">{error}</p>}
      <label><span className="auth-label">Email address</span><input className="auth-field" type="email" required autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
      <label><span className="auth-label">Password</span><PasswordField value={form.password} onChange={value => setForm({ ...form, password: value })} show={showPassword} onToggle={() => setShowPassword(current => !current)} autoComplete="current-password" /></label>
      <div className="auth-forgot-row"><button type="button" className="auth-link text-sm" onClick={() => { setMode('reset'); setResetEmail(form.email); setError(''); setNotice('') }}>Forgot password?</button></div>
      <button disabled={busy} className="auth-button w-full">{busy ? <ButtonLoader label="Signing in..." /> : 'Sign in'}</button>
    </form> : <form onSubmit={sendReset} className="space-y-5">
      {error && <p className="auth-error">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-sm font-medium text-emerald-700">{notice}</p>}
      <label><span className="auth-label">Email address</span><input className="auth-field" type="email" required autoComplete="email" value={resetEmail} onChange={event => setResetEmail(event.target.value)} /></label>
      <button disabled={busy} className="auth-button w-full">{busy ? <ButtonLoader label="Sending..." /> : 'Send reset link'}</button>
    </form>}
  </AuthShell>
}

function PasswordField({ value, onChange, show, onToggle, autoComplete }) {
  return <div className="relative">
    <input className="auth-field pr-14" type={show ? 'text' : 'password'} required minLength="8" autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} />
    <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={onToggle} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-brand-100">
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </div>
}
