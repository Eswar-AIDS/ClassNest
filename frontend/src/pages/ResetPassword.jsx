import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import AuthShell from './AuthShell'
import { ButtonLoader } from '../components/common/Loading'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async event => {
    event.preventDefault()
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/auth/reset-password', { token, new_password: form.password })
      setNotice(data.message || 'Password reset successfully. You can now sign in.')
      setTimeout(() => navigate('/login', { replace: true }), 1200)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return <AuthShell title="Set a new password" subtitle="Choose a new password for your ClassNest account." footer={<>Remembered it? <Link className="auth-link" to="/login">Sign in</Link></>}>
    <form onSubmit={submit} className="space-y-5">
      {!token && <p className="auth-error">Reset token is missing. Please use the link from your email.</p>}
      {error && <p className="auth-error">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 text-sm font-medium text-emerald-700">{notice}</p>}
      <label><span className="auth-label">New password</span><PasswordInput value={form.password} onChange={value => setForm({ ...form, password: value })} show={showPassword} onToggle={() => setShowPassword(current => !current)} autoComplete="new-password" /></label>
      <label><span className="auth-label">Confirm password</span><PasswordInput value={form.confirm} onChange={value => setForm({ ...form, confirm: value })} show={showConfirm} onToggle={() => setShowConfirm(current => !current)} autoComplete="new-password" /></label>
      <button disabled={busy || !token} className="auth-button w-full">{busy ? <ButtonLoader label="Resetting..." /> : 'Reset password'}</button>
    </form>
  </AuthShell>
}

function PasswordInput({ value, onChange, show, onToggle, autoComplete }) {
  return <div className="relative">
    <input className="auth-field pr-12" type={show ? 'text' : 'password'} required minLength="8" autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} />
    <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={onToggle} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:ring-4 focus:ring-brand-100">
      {show ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </div>
}
