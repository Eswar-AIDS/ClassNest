import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Award, BarChart3, BookOpen, ClipboardCheck, FileText, Users } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

const TABS = [
  ['overview', 'Overview'],
  ['unit', 'Unit Performance'],
  ['assessment', 'Assessment Performance'],
  ['student', 'Student Performance'],
  ['pending', 'Pending Evaluation'],
]

export default function ClassResults() {
  const { classId } = useParams()
  const [overview, setOverview] = useState(null)
  const [units, setUnits] = useState([])
  const [members, setMembers] = useState([])
  const [unitId, setUnitId] = useState('')
  const [assessmentId, setAssessmentId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [status, setStatus] = useState('all')
  const [tab, setTab] = useState('overview')
  const [unitData, setUnitData] = useState(null)
  const [assessmentData, setAssessmentData] = useState(null)
  const [studentData, setStudentData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get(`/classrooms/${classId}/results/overview`),
      api.get(`/classrooms/${classId}/results/units`),
      api.get(`/classrooms/${classId}/members`),
    ]).then(([summary, unitRows, classMembers]) => {
      setOverview(summary.data)
      setUnits(unitRows.data)
      setMembers(classMembers.data.filter(member => member.role === 'student'))
      setError('')
    }).catch(err => setError(errorMessage(err)))
  }, [classId])

  useEffect(() => {
    if (!unitId) return
    api.get(`/classrooms/${classId}/results/units/${unitId}`).then(response => {
      setUnitData(response.data)
    }).catch(err => setError(errorMessage(err)))
  }, [classId, unitId])

  useEffect(() => {
    if (!assessmentId) return
    api.get(`/classrooms/${classId}/results/assessments/${assessmentId}`).then(response => setAssessmentData(response.data)).catch(err => setError(errorMessage(err)))
  }, [assessmentId, classId])

  useEffect(() => {
    if (!studentId) return
    api.get(`/classrooms/${classId}/results/students/${studentId}`).then(response => setStudentData(response.data)).catch(err => setError(errorMessage(err)))
  }, [classId, studentId])

  const activeUnitData = String(unitData?.unit?.id) === unitId ? unitData : null
  const activeAssessmentData = String(assessmentData?.assessment?.id) === assessmentId ? assessmentData : null
  const activeStudentData = String(studentData?.student?.student_id) === studentId ? studentData : null
  const filteredUnitStudents = useMemo(() => filterRows(activeUnitData?.students || [], status, studentId), [activeUnitData, status, studentId])
  const filteredAssessmentAttempts = useMemo(() => filterRows(activeAssessmentData?.attempts || [], status, studentId), [activeAssessmentData, status, studentId])
  const filteredPending = useMemo(() => (overview?.pending_attempts || []).filter(item => (!unitId || String(item.unit_id) === unitId) && (!assessmentId || String(item.assessment_id) === assessmentId) && (!studentId || String(item.student_id) === studentId)), [overview, unitId, assessmentId, studentId])

  const chooseUnit = id => {
    setUnitId(String(id)); setAssessmentId(''); setAssessmentData(null); setTab('unit')
  }

  if (error && !overview) return <ErrorBox message={error} />
  if (!overview) return <div className="h-72 animate-pulse rounded-2xl bg-slate-200/60" />

  return <div>
    <Link to={`/classes/${classId}`} className="back-link"><ArrowLeft size={17} />Back to class</Link>
    <div className="mt-6"><p className="eyebrow flex items-center gap-2"><BarChart3 size={17} />Performance</p><h1 className="page-title mt-2">Class Results</h1><p className="mt-2 text-sm text-slate-500">Review unit-wise, assessment-wise, and student performance.</p></div>
    {error && <div className="mt-5"><ErrorBox message={error} /></div>}

    <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
      <Metric label="Active Units" value={overview.active_units} icon={BookOpen} />
      <Metric label="Assessments" value={overview.total_assessments} icon={FileText} />
      <Metric label="Submitted Attempts" value={overview.submitted_attempts} icon={ClipboardCheck} />
      <Metric label="Class Average" value={pct(overview.class_average_percentage)} icon={BarChart3} />
      <Metric label="Highest Score" value={pct(overview.highest_percentage)} icon={Award} />
      <Metric label="Lowest Score" value={pct(overview.lowest_percentage)} icon={BarChart3} />
      <Metric label="Pending Evaluation" value={overview.pending_evaluation} icon={ClipboardCheck} tone="amber" />
    </div>

    <div className="card mt-6 grid gap-3 p-4 md:grid-cols-4">
      <Select label="Unit" value={unitId} onChange={event => { setUnitId(event.target.value); setUnitData(null); setAssessmentId(''); setAssessmentData(null) }}><option value="">All units</option>{units.map(unit => <option key={unit.unit_id} value={unit.unit_id}>{unit.unit_title}</option>)}</Select>
      <Select label="Assessment" value={assessmentId} disabled={!unitId} onChange={event => { setAssessmentId(event.target.value); setAssessmentData(null) }}><option value="">All assessments</option>{(activeUnitData?.assessments || []).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</Select>
      <Select label="Status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All</option><option value="pending_evaluation">Pending Evaluation</option><option value="evaluated">Evaluated</option><option value="published">Published</option><option value="not_attempted">Not Attempted</option></Select>
      <Select label="Student" value={studentId} onChange={event => { setStudentId(event.target.value); setStudentData(null) }}><option value="">All students</option>{members.map(member => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}</Select>
    </div>

    <div className="mt-6 flex gap-1 overflow-x-auto border-b border-slate-200">{TABS.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${tab === value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div>

    {tab === 'overview' && <Overview overview={overview} units={units} chooseUnit={chooseUnit} />}
    {tab === 'unit' && <UnitPerformance data={activeUnitData} rows={filteredUnitStudents} />}
    {tab === 'assessment' && <AssessmentPerformance data={activeAssessmentData} rows={filteredAssessmentAttempts} />}
    {tab === 'student' && <StudentPerformance data={activeStudentData} />}
    {tab === 'pending' && <Pending rows={filteredPending} />}
  </div>
}

function Overview({ overview, units, chooseUnit }) {
  return <div className="mt-6 space-y-6"><p className="text-sm text-slate-500">Overall performance across active units and evaluated assessments.</p><div className="grid gap-5 lg:grid-cols-2">
    <Panel title="Top students"><SimpleStudentList rows={overview.top_students} empty="No evaluated student results yet." /></Panel>
    <Panel title="Students needing attention"><SimpleStudentList rows={overview.students_needing_attention} attention empty="No students currently need attention." /></Panel>
  </div><Panel title="Unit summary"><Table headers={['Unit', 'Assessments', 'Attempts', 'Average', 'Pending', 'Published', '']} rows={units.map(unit => [unit.unit_title, unit.assessment_count, unit.attempt_count, pct(unit.average_percentage), unit.pending_evaluation, unit.published_count, <button key="open" onClick={() => chooseUnit(unit.unit_id)} className="font-semibold text-brand-700">View</button>])} empty="No active units found." /></Panel></div>
}

function UnitPerformance({ data, rows }) {
  if (!data) return <Empty>Select a unit to view performance.</Empty>
  const summary = data.summary
  return <div className="mt-6 space-y-5"><div><h2 className="text-xl font-bold">{data.unit.title}</h2><p className="mt-1 text-sm text-slate-500">Track student performance across assessments in this unit.</p></div><SummaryStrip items={[["Assessments", summary.assessment_count], ["Students Attempted", summary.students_attempted], ["Average", pct(summary.average_percentage)], ["Highest", pct(summary.highest_percentage)], ["Lowest", pct(summary.lowest_percentage)], ["Pending", summary.pending_evaluation], ["Published", summary.published_count]]} /><Panel title="Student performance"><Table headers={['Student', 'Email', 'Attempted', 'Total Score', 'Total Marks', 'Percentage', 'Status', 'Last Submitted']} rows={rows.map(row => [row.student_name, row.student_email, row.assessments_attempted, row.score, row.total_marks, valuePct(row.percentage), <Status key="status" value={row.status} />, formatDate(row.last_submitted)])} empty="No evaluated submissions found for this unit." /></Panel></div>
}

function AssessmentPerformance({ data, rows }) {
  if (!data) return <Empty>Select a unit and assessment to view performance.</Empty>
  const summary = data.summary
  return <div className="mt-6 space-y-5"><div><h2 className="text-xl font-bold">{data.assessment.title}</h2><p className="mt-1 text-sm text-slate-500">Review scores, publish status, and submissions for this assessment. · {data.assessment.unit_title}</p></div><SummaryStrip items={[["Total Marks", data.assessment.total_marks], ["Attempts", summary.attempt_count], ["Class Average", pct(summary.class_average_percentage)], ["Highest", pct(summary.highest_percentage)], ["Lowest", pct(summary.lowest_percentage)], ["Published", summary.published_count], ["Pending", summary.pending_evaluation]]} /><Panel title="Assessment attempts"><Table headers={['Student', 'Email', 'Score', 'Total', 'Percentage', 'Attempt Status', 'Publish Status', 'Submitted', 'Action']} rows={rows.map(row => [row.student_name, row.student_email, row.score ?? '—', row.total_marks, valuePct(row.percentage), <Status key="attempt" value={row.status} />, <Status key="publish" value={row.publish_status} />, formatDate(row.submitted_at), row.attempt_id ? <Link key="action" className="font-semibold text-brand-700" to={`/assessments/${data.assessment.id}/dashboard`}>{row.status === 'pending_evaluation' ? 'Evaluate' : row.status === 'published' ? 'View Published Result' : 'Publish Result'}</Link> : '—'])} empty="No submissions found for this assessment." /></Panel></div>
}

function StudentPerformance({ data }) {
  if (!data) return <Empty>Select a student to view performance.</Empty>
  const summary = data.summary
  return <div className="mt-6 space-y-5"><div><h2 className="text-xl font-bold">{data.student.student_name}</h2><p className="mt-1 text-sm text-slate-500">{data.student.student_email} · Joined {formatDate(data.student.joined_at)}</p><p className="mt-2 text-sm text-slate-500">Review one student&apos;s progress across all active units.</p></div><SummaryStrip items={[["Units Attempted", summary.units_attempted], ["Assessments Attempted", summary.assessments_attempted], ["Overall Score", `${summary.score} / ${summary.total_marks}`], ["Overall Percentage", valuePct(summary.percentage)], ["Pending", summary.pending_evaluation], ["Published", summary.published_count]]} /><Panel title="Unit breakdown"><Table headers={['Unit', 'Assessments Attempted', 'Score', 'Total Marks', 'Percentage', 'Status']} rows={data.unit_breakdown.map(row => [row.unit_title, row.assessments_attempted, row.score, row.total_marks, valuePct(row.percentage), <Status key="status" value={row.status} />])} /></Panel><Panel title="Assessment breakdown"><Table headers={['Unit', 'Assessment', 'Score', 'Total Marks', 'Percentage', 'Attempt Status', 'Published Status', 'Submitted']} rows={data.assessment_breakdown.map(row => [row.unit_title, row.assessment_title, row.score ?? '—', row.total_marks, valuePct(row.percentage), <Status key="attempt" value={row.status} />, <Status key="publish" value={row.publish_status} />, formatDate(row.submitted_at)])} /></Panel></div>
}

function Pending({ rows }) {
  return <div className="mt-6"><p className="mb-5 text-sm text-slate-500">Submissions waiting for teacher review.</p><Panel title="Pending evaluation"><Table headers={['Student', 'Email', 'Unit', 'Assessment', 'Submitted At', 'Action']} rows={rows.map(row => [row.student_name, row.student_email, row.unit_title, row.assessment_title, formatDate(row.submitted_at), <Link key="evaluate" className="font-semibold text-brand-700" to={`/assessments/${row.assessment_id}/dashboard`}>Evaluate</Link>])} empty="No pending evaluations." /></Panel></div>
}

function Metric({ label, value, icon: Icon, tone = 'blue' }) { return <div className="card p-4"><div className={`mb-3 grid size-8 place-items-center rounded-lg ${tone === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'}`}><Icon size={16} /></div><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div> }
function Select({ label, children, ...props }) { return <label><span className="label">{label}</span><select className="field" {...props}>{children}</select></label> }
function Panel({ title, children }) { return <section className="card overflow-hidden"><div className="border-b border-slate-200 px-5 py-4"><h3 className="font-bold">{title}</h3></div>{children}</section> }
function SummaryStrip({ items }) { return <div className="card grid divide-y divide-slate-200 overflow-hidden sm:grid-cols-3 sm:divide-x sm:divide-y-0 xl:grid-cols-7">{items.map(([label, value]) => <div key={label} className="p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>)}</div> }
function Empty({ children }) { return <div className="empty-state mt-6">{children}</div> }
function ErrorBox({ message }) { return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</p> }

function Table({ headers, rows = [], empty = 'No results found.' }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-max text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{headers.map(header => <th key={header} className="px-5 py-3 font-bold">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={index} className="hover:bg-slate-50/60">{row.map((cell, cellIndex) => <td key={cellIndex} className={`px-5 py-4 ${cellIndex === 0 ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{cell}</td>)}</tr>)}{!rows.length && <tr><td colSpan={headers.length} className="p-10 text-center text-slate-500">{empty}</td></tr>}</tbody></table></div>
}

function SimpleStudentList({ rows, attention = false, empty }) {
  if (!rows.length) return <p className="p-6 text-sm text-slate-500">{empty}</p>
  return <div className="divide-y divide-slate-100">{rows.map(row => <div key={row.student_id} className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="font-semibold">{row.student_name}</p><p className="text-xs text-slate-500">{attention ? `${row.missing_assessments} missing · ${row.pending_evaluation} pending` : row.student_email}</p></div><span className="font-bold">{valuePct(row.percentage)}</span></div>)}</div>
}

function Status({ value }) {
  const labels = { pending_evaluation: 'Pending Evaluation', evaluated: 'Evaluated, Not Published', published: 'Published', not_attempted: 'Not Attempted', not_published: 'Not Published' }
  const color = value === 'published' ? 'bg-emerald-50 text-emerald-700' : value === 'pending_evaluation' ? 'bg-amber-50 text-amber-700' : value === 'not_attempted' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-700'
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${color}`}>{labels[value] || value}</span>
}

function filterRows(rows, status, studentId) {
  return rows.filter(row => (status === 'all' || row.status === status) && (!studentId || String(row.student_id) === studentId))
}
function pct(value) { return `${Number(value || 0).toFixed(1)}%` }
function valuePct(value) { return value == null ? '—' : pct(value) }
function formatDate(value) { return value ? serverDate(value).toLocaleString() : '—' }
function serverDate(value) { return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`) }
