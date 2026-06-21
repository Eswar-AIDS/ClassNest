import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, BookOpen } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

export default function InviteJoin() {
  const { joinCode } = useParams()
  const navigate = useNavigate()
  const started = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (started.current) return
    started.current = true

    api.post('/classrooms/join', { join_code: joinCode })
      .then(response => navigate(`/classes/${response.data.id}`, { replace: true }))
      .catch(err => {
        if (err.response?.status === 409) {
          setError('You are already in this class')
        } else {
          setError(errorMessage(err))
        }
      })
  }, [joinCode, navigate])

  if (!error) {
    return <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600"><BookOpen /></span>
        <h1 className="mt-4 text-xl font-bold">Joining your classroom…</h1>
        <p className="mt-2 text-sm text-slate-500">Checking invite code {joinCode?.toUpperCase()}</p>
      </div>
    </div>
  }

  return <div className="mx-auto max-w-lg py-12">
    <div className="card p-7 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 text-red-600"><AlertCircle /></span>
      <h1 className="mt-4 text-2xl font-bold">Unable to join classroom</h1>
      <p className="mt-2 text-slate-600">{error}</p>
      <Link to="/" className="btn-primary mt-6">Go to dashboard</Link>
    </div>
  </div>
}
