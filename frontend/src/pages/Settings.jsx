import { useEffect, useState } from 'react'
import { KeyRound, Save, UserRound } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import { useAuth } from '../context/AuthContext'
import UserAvatar from '../components/UserAvatar'

export default function Settings() {
  const { refresh } = useAuth()
  const [profile, setProfile] = useState(null)
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm_password: '' })
  const [profileStatus, setProfileStatus] = useState({ error: '', success: '', busy: false })
  const [passwordStatus, setPasswordStatus] = useState({ error: '', success: '', busy: false })

  useEffect(() => {
    api.get('/users/me').then(response => setProfile(response.data)).catch(err => setProfileStatus({ error: errorMessage(err), success: '', busy: false }))
  }, [])

  const saveProfile = async event => {
    event.preventDefault()
    setProfileStatus({ error: '', success: '', busy: true })
    try {
      const response = await api.put('/users/me', { name: profile.name, bio: profile.bio?.trim() || null, avatar_url: profile.avatar_url?.trim() || null })
      setProfile(response.data)
      await refresh()
      setProfileStatus({ error: '', success: 'Profile updated successfully.', busy: false })
    } catch (err) {
      setProfileStatus({ error: errorMessage(err), success: '', busy: false })
    }
  }

  const changePassword = async event => {
    event.preventDefault()
    if (passwords.new_password !== passwords.confirm_password) {
      setPasswordStatus({ error: 'New passwords do not match.', success: '', busy: false })
      return
    }
    setPasswordStatus({ error: '', success: '', busy: true })
    try {
      await api.put('/users/me/password', { current_password: passwords.current_password, new_password: passwords.new_password })
      setPasswords({ current_password: '', new_password: '', confirm_password: '' })
      setPasswordStatus({ error: '', success: 'Password changed successfully.', busy: false })
    } catch (err) {
      setPasswordStatus({ error: errorMessage(err), success: '', busy: false })
    }
  }

  if (!profile && !profileStatus.error) return <div className="mx-auto h-96 max-w-3xl animate-pulse rounded-2xl bg-slate-200/60" />
  if (!profile) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{profileStatus.error}</p>

  return <div className="mx-auto max-w-3xl">
    <div><p className="eyebrow">Account</p><h1 className="page-title mt-2">Account settings</h1><p className="mt-2 text-sm text-slate-500">Manage your public profile and account security.</p></div>

    <form onSubmit={saveProfile} className="card mt-7 p-6 sm:p-8">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-5"><span className="grid size-10 place-items-center rounded-lg bg-brand-50 text-brand-700"><UserRound size={19} /></span><div><h2 className="font-bold text-slate-900">Profile information</h2><p className="mt-0.5 text-xs text-slate-500">Shown across your ClassNest account.</p></div></div>
      <div className="mt-6 flex items-center gap-4"><UserAvatar user={profile} size="lg" /><div><p className="text-sm font-semibold text-slate-800">Avatar preview</p><p className="mt-1 text-xs leading-5 text-slate-500">Add a public HTTPS image URL below, or keep your initial avatar.</p></div></div>
      <div className="mt-6 space-y-5">
        <StatusMessage status={profileStatus} />
        <label><span className="label">Full name</span><input className="field" required minLength="2" maxLength="120" value={profile.name} onChange={event => setProfile({ ...profile, name: event.target.value })} /></label>
        <label><span className="label">Email</span><input className="field bg-slate-50 text-slate-500" disabled value={profile.email} /></label>
        <label><span className="label">Bio <span className="font-normal text-slate-400">(optional)</span></span><textarea className="field resize-y" rows="4" maxLength="1000" placeholder="Tell your class a little about yourself…" value={profile.bio || ''} onChange={event => setProfile({ ...profile, bio: event.target.value })} /><span className="mt-1 block text-right text-xs text-slate-400">{(profile.bio || '').length}/1000</span></label>
        <label><span className="label">Profile image URL <span className="font-normal text-slate-400">(optional)</span></span><input className="field" type="url" placeholder="https://example.com/avatar.jpg" value={profile.avatar_url || ''} onChange={event => setProfile({ ...profile, avatar_url: event.target.value })} /></label>
      </div>
      <div className="mt-6 flex justify-end"><button disabled={profileStatus.busy} className="btn-primary"><Save size={15} />{profileStatus.busy ? 'Saving…' : 'Save profile'}</button></div>
    </form>

    <form onSubmit={changePassword} className="card mt-5 p-6 sm:p-8">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-5"><span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-600"><KeyRound size={19} /></span><div><h2 className="font-bold text-slate-900">Change password</h2><p className="mt-0.5 text-xs text-slate-500">Confirm your current password before choosing a new one.</p></div></div>
      <div className="mt-6 space-y-5">
        <StatusMessage status={passwordStatus} />
        <label><span className="label">Current password</span><input className="field" type="password" autoComplete="current-password" required value={passwords.current_password} onChange={event => setPasswords({ ...passwords, current_password: event.target.value })} /></label>
        <label><span className="label">New password</span><input className="field" type="password" autoComplete="new-password" required minLength="8" value={passwords.new_password} onChange={event => setPasswords({ ...passwords, new_password: event.target.value })} /></label>
        <label><span className="label">Confirm new password</span><input className="field" type="password" autoComplete="new-password" required minLength="8" value={passwords.confirm_password} onChange={event => setPasswords({ ...passwords, confirm_password: event.target.value })} /></label>
      </div>
      <div className="mt-6 flex justify-end"><button disabled={passwordStatus.busy} className="btn-primary">{passwordStatus.busy ? 'Changing…' : 'Change password'}</button></div>
    </form>
  </div>
}

function StatusMessage({ status }) {
  if (status.error) return <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{status.error}</p>
  if (status.success) return <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{status.success}</p>
  return null
}
