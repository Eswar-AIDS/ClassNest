import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import MaterialCard from '../components/MaterialCard'
import TestCard from '../components/TestCard'
import AssessmentCard from '../components/AssessmentCard'

export default function UnitDetails() {
  const { unitId } = useParams()
  const [unit, setUnit] = useState(null)
  const [room, setRoom] = useState(null)
  const [materials, setMaterials] = useState([])
  const [tests, setTests] = useState([])
  const [assessments, setAssessments] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/units/${unitId}`).then(async response => {
      setUnit(response.data)
      const [classroomResponse, materialsResponse, testsResponse, assessmentsResponse] = await Promise.all([
        api.get(`/classrooms/${response.data.classroom_id}`),
        api.get(`/units/${unitId}/materials`),
        api.get(`/units/${unitId}/tests`),
        api.get(`/units/${unitId}/assessments`),
      ])
      setRoom(classroomResponse.data)
      setMaterials(materialsResponse.data)
      setTests(testsResponse.data)
      setAssessments(assessmentsResponse.data)
    })
  }, [unitId])

  const deleteMaterial = async material => {
    if (!window.confirm('Are you sure you want to delete this material?')) return
    try {
      await api.delete(`/materials/${material.id}`)
      setMaterials(current => current.filter(item => item.id !== material.id))
    } catch (err) { setError(errorMessage(err)) }
  }

  const deleteAssessment = async assessment => {
    if (!window.confirm('Are you sure you want to archive/delete this assessment?')) return
    try {
      const response = await api.delete(`/assessments/${assessment.id}`)
      if (response.data.archived) setAssessments(current => current.map(item => item.id === assessment.id ? { ...item, archived: true, is_published: false, is_accepting_responses: false } : item))
      else setAssessments(current => current.filter(item => item.id !== assessment.id))
    } catch (err) { setError(errorMessage(err)) }
  }

  if (!unit || !room) return <div className="h-56 animate-pulse rounded-2xl bg-slate-200/60" />
  const teacher = room.role === 'teacher'

  return <>
    <Link to={`/classes/${room.id}`} className="back-link"><ArrowLeft size={16} />{room.name}</Link>
    <header className="mt-6 border-b border-slate-200 pb-7">
      <p className="eyebrow">Unit {unit.order_number}</p>
      <h1 className="page-title mt-2">{unit.title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">{unit.description}</p>
    </header>
    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

    <div className="mt-8 grid gap-9 lg:grid-cols-2 lg:gap-8">
      <ContentSection title="Learning materials" description="Notes and resources for this unit." action={teacher && <Link className="btn-secondary" to={`/units/${unitId}/materials/new`}><Plus size={15} />Add material</Link>}>
        {materials.map(material => <MaterialCard key={material.id} material={material} teacher={teacher} classId={room.id} unitId={unitId} onDelete={deleteMaterial} />)}
        {!materials.length && <div className="empty-state">No learning materials yet.</div>}
      </ContentSection>
      <ContentSection title="Assessments" description="Teacher-controlled assessments and legacy tests." action={teacher && <Link className="btn-secondary" to={`/units/${unitId}/assessments/new`}><Plus size={15} />Create assessment</Link>}>
        {assessments.map(assessment => <AssessmentCard key={assessment.id} assessment={assessment} teacher={teacher} classId={room.id} unitId={unitId} onDelete={deleteAssessment} />)}
        {tests.map(test => <TestCard key={test.id} test={test} />)}
        {!tests.length && !assessments.length && <div className="empty-state">No assessments available.</div>}
      </ContentSection>
    </div>
  </>
}

function ContentSection({ title, description, action, children }) {
  return <section>
    <div className="mb-4 flex min-h-12 items-start justify-between gap-3">
      <div><h2 className="section-title">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>
      {action}
    </div>
    <div className="grid gap-3">{children}</div>
  </section>
}
