import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileUp, Save } from 'lucide-react'
import api, { errorMessage, getOnce } from '../api/axios'

const WEB_TEMPLATES = {
  blank: { label: 'Blank', starter_html: '', starter_css: '', starter_js: '' },
  basic: {
    label: 'Basic HTML Page',
    starter_html: '<div class="card">\n  <h1>Hello ClassNest</h1>\n  <p>Build your page here.</p>\n</div>',
    starter_css: 'body {\n  font-family: Arial, sans-serif;\n  padding: 20px;\n}\n.card {\n  border: 1px solid #ddd;\n  padding: 16px;\n  border-radius: 8px;\n}',
    starter_js: 'console.log("ClassNest Web Codespace ready");',
  },
  button: {
    label: 'Button Click',
    starter_html: '<button id="btn">Click me</button>\n<p id="result"></p>',
    starter_css: 'button {\n  padding: 10px 16px;\n  cursor: pointer;\n}',
    starter_js: 'document.getElementById("btn").addEventListener("click", function () {\n  document.getElementById("result").textContent = "Button clicked!";\n});',
  },
  card: {
    label: 'Card Layout',
    starter_html: '<section class="profile-card">\n  <h1>Student Portfolio</h1>\n  <p>Add your introduction here.</p>\n  <button id="themeBtn">Change theme</button>\n</section>',
    starter_css: 'body {\n  font-family: Arial, sans-serif;\n  padding: 24px;\n  background: #f8fafc;\n}\n.profile-card {\n  max-width: 420px;\n  border: 1px solid #cbd5e1;\n  padding: 20px;\n  border-radius: 8px;\n  background: white;\n}',
    starter_js: 'document.getElementById("themeBtn").addEventListener("click", function () {\n  document.body.style.background = "#e0f2fe";\n});',
  },
}

const blankTask = { title: '', description: '', task_type: 'python', starter_code: '', starter_html: '', starter_css: '', starter_js: '', preview_enabled: false, expected_output: '', language: 'python', question_id: '', unit_no: '', unit_title: '', assessment_title: '', difficulty: '', explanation: '', visible_test_cases: '', hidden_test_cases: '', tags: '', marks: 10, due_at: '', is_published: false }

export default function CodingTaskEditor() {
  const { classId, codespaceId, taskId } = useParams()
  const navigate = useNavigate()
  const [codespace, setCodespace] = useState(null)
  const [form, setForm] = useState(blankTask)
  const [createMethod, setCreateMethod] = useState('manual')
  const [taskPreviews, setTaskPreviews] = useState([])
  const [answerKeyPreviews, setAnswerKeyPreviews] = useState([])
  const [selectedQuestionId, setSelectedQuestionId] = useState('')
  const [loadedAnswerKey, setLoadedAnswerKey] = useState(null)
  const [existingTasks, setExistingTasks] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    const url = codespaceId ? `/codespaces/${codespaceId}` : `/classes/${classId}/codespace`
    api.get(url).then(async response => {
      if (!active) return
      setCodespace(response.data)
      if (taskId) {
        const [tasks, taskResponse] = await Promise.all([
          getOnce(`/codespaces/${response.data.id}/tasks`),
          api.get(`/coding-tasks/${taskId}`),
        ])
        setExistingTasks(tasks.data)
        const task = taskResponse.data
        if (!active) return
        setForm({
          title: task.title,
          description: task.description || '',
          task_type: task.task_type || 'python',
          starter_code: task.starter_code || '',
          starter_html: task.starter_html || '',
          starter_css: task.starter_css || '',
          starter_js: task.starter_js || '',
          preview_enabled: task.preview_enabled || task.task_type === 'web',
          expected_output: task.expected_output || '',
          language: task.language || 'python',
          question_id: task.question_id || '',
          unit_no: task.unit_no || '',
          unit_title: task.unit_title || '',
          assessment_title: task.assessment_title || '',
          difficulty: task.difficulty || '',
          explanation: task.explanation || '',
          visible_test_cases: task.visible_test_cases || '',
          hidden_test_cases: task.hidden_test_cases || '',
          tags: task.tags || '',
          marks: task.marks,
          due_at: task.due_at ? toLocalInput(task.due_at) : '',
          is_published: task.is_published,
        })
      } else {
        const tasks = await getOnce(`/codespaces/${response.data.id}/tasks`)
        if (active) setExistingTasks(tasks.data)
      }
    }).catch(err => { if (active) setError(errorMessage(err)) })
    return () => { active = false }
  }, [classId, codespaceId, taskId])

  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = cleanPayload(form, matchedAnswerKey)
    try {
      if (taskId) await api.put(`/coding-tasks/${taskId}`, payload)
      else {
        const duplicate = payload.question_id ? existingTasks.find(task => task.question_id === payload.question_id) : null
        if (duplicate) {
          if (!window.confirm('This question already exists. Update existing task?')) {
            setBusy(false)
            return
          }
          await api.put(`/coding-tasks/${duplicate.id}`, payload)
        } else {
          await api.post(`/codespaces/${codespace.id}/tasks`, payload)
        }
      }
      navigate(`/codespaces/${codespace.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const uploadPreview = async (file, endpoint, setter) => {
    if (!file || !codespace) return
    setError('')
    setNotice('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const { data } = await api.post(`/codespaces/${codespace.id}/${endpoint}`, formData)
      setter(data)
      setNotice(`${data.length} coding ${endpoint.includes('answer') ? 'answer keys' : 'questions'} detected.`)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const selectQuestion = questionId => {
    setSelectedQuestionId(questionId)
    const item = taskPreviews.find(row => row.question_id === questionId)
    if (!item) return
    setForm(current => ({
      ...current,
      title: item.title || current.title,
      description: item.description || item.question_text || '',
      starter_code: item.starter_code || '',
      expected_output: item.expected_output || '',
      language: item.language || 'python',
      question_id: item.question_id || '',
      unit_no: item.unit_no || '',
      unit_title: item.unit_title || '',
      assessment_title: item.assessment_title || '',
      difficulty: item.difficulty || '',
      explanation: item.explanation || '',
      visible_test_cases: item.visible_test_cases || '',
      hidden_test_cases: item.hidden_test_cases || '',
      tags: item.tags || '',
      marks: item.marks ?? 10,
    }))
    const matchedKey = answerKeyPreviews.find(row => row.question_id === questionId)
    setLoadedAnswerKey(matchedKey || null)
    if (matchedKey) setNotice('Answer key loaded.')
  }

  const matchedAnswerKey = loadedAnswerKey || answerKeyPreviews.find(row => row.question_id === selectedQuestionId || row.question_id === form.question_id)

  return <div className="mx-auto max-w-3xl">
    <Link className="back-link" to={codespace ? `/codespaces/${codespace.id}` : '/codespaces'}><ArrowLeft size={16} />Back to codespace</Link>
    <section className="card mt-5 p-6 sm:p-8">
      <h1 className="page-title">{taskId ? 'Edit coding task' : 'Create coding task'}</h1>
      <p className="mt-2 text-sm text-slate-500">For many tasks at once, use Bulk Import from the Codespace page.</p>
      <form onSubmit={submit} className="mt-7 space-y-5">
        {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
        {!taskId && <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-900">Create method</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {['manual', 'import'].map(method => <label key={method} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-semibold ${createMethod === method ? 'border-brand-500 bg-white text-brand-700' : 'border-slate-200 bg-white text-slate-600'}`}>
              <input type="radio" checked={createMethod === method} onChange={() => setCreateMethod(method)} />
              {method === 'manual' ? 'Manual entry' : 'Import from Excel'}
            </label>)}
          </div>
        </section>}
        {!taskId && createMethod === 'import' && <section className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <div><p className="text-sm font-bold text-slate-900">Import from Excel</p><p className="mt-1 text-xs leading-5 text-slate-500">Use this when you want to create a coding task from the Excel template.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-700"><FileUp size={18} className="text-brand-700" />Upload Coding Assessment Excel<input className="sr-only" type="file" accept=".xlsx" onChange={event => uploadPreview(event.target.files?.[0], 'preview-task-import', setTaskPreviews)} /></label>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-700"><FileUp size={18} className="text-brand-700" />Upload Answer Key Excel optional<input className="sr-only" type="file" accept=".xlsx" onChange={event => uploadPreview(event.target.files?.[0], 'preview-answer-key-import', setAnswerKeyPreviews)} /></label>
          </div>
          {!!taskPreviews.length && <label><span className="label">Detected coding questions</span><select className="field" value={selectedQuestionId} onChange={event => selectQuestion(event.target.value)}><option value="">Choose a coding question</option>{taskPreviews.map(item => <option key={item.question_id || item.title} value={item.question_id}>{item.question_id || 'No QuestionID'} - {(item.question_text || '').slice(0, 80)}</option>)}</select></label>}
          {matchedAnswerKey && <span className="inline-flex w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase text-emerald-700">Answer key loaded</span>}
        </section>}
        <ManualFields form={form} setForm={setForm} />
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4"><input type="checkbox" checked={form.is_published} onChange={event => setForm({ ...form, is_published: event.target.checked })} className="mt-0.5 size-4 rounded border-slate-300 text-brand-600" /><span><span className="block text-sm font-semibold text-slate-800">Publish to students</span><span className="mt-1 block text-xs text-slate-500">Draft tasks remain visible only to teachers.</span></span></label>
        <div className="flex justify-end gap-2"><Link className="btn-secondary" to={codespace ? `/codespaces/${codespace.id}` : '/codespaces'}>Cancel</Link><button className="btn-primary" disabled={busy || !codespace}><Save size={16} />{busy ? 'Saving...' : 'Save task'}</button></div>
      </form>
    </section>
  </div>
}

function ManualFields({ form, setForm }) {
  return <>
    <label><span className="label">Title</span><input className="field" required maxLength="200" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
    <label><span className="label">Description</span><textarea className="field resize-y" rows="5" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
    <label><span className="label">Task type</span><select className="field" value={form.task_type} onChange={event => setForm({ ...form, task_type: event.target.value, language: event.target.value === 'web' ? 'html-css-js' : 'python', preview_enabled: event.target.value === 'web' })}><option value="python">Python</option><option value="web">HTML/CSS/JS Web</option></select></label>
    {form.task_type === 'web' ? <WebStarterFields form={form} setForm={setForm} /> : <label><span className="label">Starter code</span><textarea className="field font-mono text-xs" rows="8" value={form.starter_code} onChange={event => setForm({ ...form, starter_code: event.target.value })} /></label>}
    <label><span className="label">Expected output / evaluation rule</span><textarea className="field resize-y" rows="4" value={form.expected_output} onChange={event => setForm({ ...form, expected_output: event.target.value })} /></label>
    <div className="grid gap-4 sm:grid-cols-3">
      <label><span className="label">Marks</span><input className="field" type="number" min="0" max="1000" value={form.marks} onChange={event => setForm({ ...form, marks: event.target.value })} /></label>
      <label><span className="label">Language</span><select className="field" value={form.language} onChange={event => setForm({ ...form, language: event.target.value })}>{form.task_type === 'web' ? <option value="html-css-js">HTML/CSS/JS</option> : <option value="python">Python</option>}</select></label>
      <label><span className="label">Due date</span><input className="field" type="datetime-local" value={form.due_at} onChange={event => setForm({ ...form, due_at: event.target.value })} /></label>
    </div>
  </>
}

function WebStarterFields({ form, setForm }) {
  const applyTemplate = key => {
    const template = WEB_TEMPLATES[key]
    setForm({ ...form, starter_html: template.starter_html, starter_css: template.starter_css, starter_js: template.starter_js, preview_enabled: true })
  }
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <label><span className="label">Starter template</span><select className="field bg-white" defaultValue="" onChange={event => applyTemplate(event.target.value)}><option value="" disabled>Choose a template</option>{Object.entries(WEB_TEMPLATES).map(([key, template]) => <option key={key} value={key}>{template.label}</option>)}</select></label>
    <label><span className="label">Starter HTML</span><textarea className="field bg-white font-mono text-xs" rows="7" value={form.starter_html} onChange={event => setForm({ ...form, starter_html: event.target.value })} /></label>
    <label><span className="label">Starter CSS</span><textarea className="field bg-white font-mono text-xs" rows="7" value={form.starter_css} onChange={event => setForm({ ...form, starter_css: event.target.value })} /></label>
    <label><span className="label">Starter JavaScript</span><textarea className="field bg-white font-mono text-xs" rows="7" value={form.starter_js} onChange={event => setForm({ ...form, starter_js: event.target.value })} /></label>
    <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"><input type="checkbox" checked={form.preview_enabled} onChange={event => setForm({ ...form, preview_enabled: event.target.checked })} className="mt-0.5 size-4 rounded border-slate-300 text-brand-600" /><span><span className="block text-sm font-semibold text-slate-800">Live preview enabled</span><span className="mt-1 block text-xs text-slate-500">Students run this task in a sandboxed browser iframe.</span></span></label>
  </section>
}

function cleanPayload(form, answerKey) {
  return {
    ...form,
    question_id: form.question_id || null,
    unit_no: form.unit_no === '' ? null : Number(form.unit_no),
    unit_title: form.unit_title || null,
    assessment_title: form.assessment_title || null,
    difficulty: form.difficulty || null,
    explanation: form.explanation || null,
    visible_test_cases: form.visible_test_cases || null,
    hidden_test_cases: form.hidden_test_cases || null,
    tags: form.tags || null,
    task_type: form.task_type || 'python',
    starter_code: form.task_type === 'python' ? form.starter_code || null : null,
    starter_html: form.task_type === 'web' ? form.starter_html || null : null,
    starter_css: form.task_type === 'web' ? form.starter_css || null : null,
    starter_js: form.task_type === 'web' ? form.starter_js || null : null,
    preview_enabled: form.task_type === 'web' ? Boolean(form.preview_enabled) : false,
    language: form.task_type === 'web' ? 'html-css-js' : form.language,
    expected_output: form.expected_output || null,
    marks: Number(form.marks),
    due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
    answer_key: answerKey ? { ...answerKey, question_id: answerKey.question_id || form.question_id } : null,
  }
}

function toLocalInput(value) {
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
