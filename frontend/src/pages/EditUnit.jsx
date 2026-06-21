import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import SimpleForm from './SimpleForm'

export default function EditUnit() {
  const { classId, unitId } = useParams()
  const navigate = useNavigate()
  const [unit, setUnit] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get(`/units/${unitId}`),
      api.get(`/classrooms/${classId}`),
    ]).then(([unitResponse, classroomResponse]) => {
      if (String(unitResponse.data.classroom_id) !== String(classId)) {
        setError('This unit does not belong to the selected classroom.')
        return
      }
      if (classroomResponse.data.role !== 'teacher') {
        setError('Teacher access required')
        return
      }
      setUnit(unitResponse.data)
    }).catch(err => setError(errorMessage(err)))
  }, [classId, unitId])

  if (error) {
    return <div className="mx-auto max-w-2xl">
      <Link to={`/classes/${classId}`} className="back-link"><ArrowLeft size={16} />Back to class</Link>
      <div className="card mt-6 p-7 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-red-50 text-red-600"><AlertCircle size={21} /></span>
        <h1 className="mt-4 text-xl font-bold text-slate-950">Unable to edit unit</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
      </div>
    </div>
  }

  if (!unit) {
    return <div className="mx-auto max-w-2xl">
      <div className="h-8 w-28 animate-pulse rounded bg-slate-200" />
      <div className="mt-6 h-96 animate-pulse rounded-2xl bg-slate-200/60" />
    </div>
  }

  return <SimpleForm
    title="Edit unit"
    subtitle="Update this unit's title, description, or position in the course."
    initial={{
      title: unit.title,
      description: unit.description || '',
      order_number: unit.order_number,
    }}
    fields={[
      { name: 'title', label: 'Unit title', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'order_number', label: 'Order number', type: 'number', min: 1, required: true },
    ]}
    submitLabel="Save changes"
    onSubmit={async data => {
      await api.put(`/units/${unitId}`, data)
      navigate(`/classes/${classId}`, { replace: true })
    }}
  />
}
