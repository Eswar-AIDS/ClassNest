import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2, Users, X } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import { useAuth } from '../context/AuthContext'

export default function MembersPage() {
  const { classId } = useParams()
  const { user } = useAuth()
  const [members, setMembers] = useState([])
  const [room, setRoom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [memberToRemove, setMemberToRemove] = useState(null)
  const [removing, setRemoving] = useState(false)

  const isTeacher = room?.role === 'teacher'

  useEffect(() => {
    let active = true
    Promise.all([
      api.get(`/classrooms/${classId}`),
      api.get(`/classrooms/${classId}/members`),
    ])
      .then(([classResponse, membersResponse]) => {
        if (!active) return
        setRoom(classResponse.data)
        setMembers(membersResponse.data)
        setError('')
      })
      .catch(err => {
        if (active) setError(errorMessage(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [classId])

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return
    setRemoving(true)
    setError('')
    setSuccess('')
    try {
      await api.delete(`/classrooms/${classId}/members/${memberToRemove.id}`)
      setSuccess('Member removed from the class.')
      setMemberToRemove(null)
      const membersResponse = await api.get(`/classrooms/${classId}/members`)
      setMembers(membersResponse.data)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <>
      <Link to={`/classes/${classId}`} className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-500">
        <ArrowLeft size={17} />
        Back to class
      </Link>

      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Users />
        </span>
        <div>
          <h1 className="page-title">Class members</h1>
          <p className="text-slate-500">{room?.name}</p>
        </div>
      </div>

      {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

      <div className="card mt-7 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Role in class</th>
                <th className="px-5 py-3">Joined</th>
                {isTeacher && <th className="px-5 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td className="px-5 py-6 text-slate-500" colSpan={isTeacher ? 5 : 4}>
                    Loading members...
                  </td>
                </tr>
              ) : members.length ? (
                members.map(member => {
                  const isCurrentUser = member.user_id === user?.id
                  return (
                    <tr key={member.id}>
                      <td className="px-5 py-4 font-semibold">{member.name}</td>
                      <td className="px-5 py-4 text-slate-500">{member.email || 'Hidden'}</td>
                      <td className="px-5 py-4 capitalize">{member.role}</td>
                      <td className="px-5 py-4 text-slate-500">{new Date(member.joined_at).toLocaleDateString()}</td>
                      {isTeacher && (
                        <td className="px-5 py-4 text-right">
                          {isCurrentUser ? (
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">You</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setMemberToRemove(member)}
                              className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                            >
                              <Trash2 size={14} />
                              Remove
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-5 py-6 text-slate-500" colSpan={isTeacher ? 5 : 4}>
                    No members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {memberToRemove && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Remove member</h2>
                <p className="mt-2 text-sm text-slate-600">Remove this member from the class?</p>
              </div>
              <button type="button" onClick={() => setMemberToRemove(null)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-950">{memberToRemove.name}</p>
              <p className="text-sm text-slate-500">{memberToRemove.email || 'Hidden email'}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{memberToRemove.role}</p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setMemberToRemove(null)} className="btn-secondary" disabled={removing}>
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveMember}
                className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={removing}
              >
                {removing ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
