import { useState } from 'react'

export default function UserAvatar({ user, size = 'md', className = '' }) {
  const [failedUrl, setFailedUrl] = useState(null)

  const sizes = size === 'xl' ? 'size-28 text-4xl' : size === 'lg' ? 'size-24 text-3xl' : size === 'sm' ? 'size-9 text-sm' : 'size-12 text-lg'
  const initial = user?.name?.trim()?.[0]?.toUpperCase() || '?'

  if (user?.avatar_url && failedUrl !== user.avatar_url) {
    return <img src={user.avatar_url} alt={`${user.name} profile`} referrerPolicy="no-referrer" onError={() => setFailedUrl(user.avatar_url)} className={`${sizes} shrink-0 rounded-full border border-slate-200 object-cover ${className}`} />
  }

  return <span aria-hidden="true" className={`${sizes} grid shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-700 ring-1 ring-brand-600/10 ${className}`}>{initial}</span>
}
