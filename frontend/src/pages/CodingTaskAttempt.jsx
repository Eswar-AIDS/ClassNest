import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Maximize2, Minimize2, MonitorUp } from 'lucide-react'
import api, { errorMessage } from '../api/axios'
import useClassActivity from '../hooks/useClassActivity'

const PythonCodeWorkspace = lazy(() => import('../components/code/PythonCodeWorkspace'))
const WebCodeWorkspace = lazy(() => import('../components/code/WebCodeWorkspace'))

export default function CodingTaskAttempt() {
  const { classId, codespaceId, taskId } = useParams()
  const [codespace, setCodespace] = useState(null)
  const [task, setTask] = useState(null)
  const [code, setCode] = useState('')
  const [webCode, setWebCode] = useState({ html_code: '', css_code: '', js_code: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [evaluationStatus, setEvaluationStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [focusMode, setFocusMode] = useState(false)

  useEffect(() => {
    let active = true
    const url = codespaceId ? `/codespaces/${codespaceId}` : `/classes/${classId}/codespace`
    api.get(url).then(async response => {
      const taskResponse = await api.get(`/coding-tasks/${taskId}`)
      const found = taskResponse.data
      if (!active) return
      setCodespace(response.data)
      setTask(found)
      if (found.task_type === 'web') {
        setWebCode({
          html_code: found.my_html_code ?? found.starter_html ?? '',
          css_code: found.my_css_code ?? found.starter_css ?? '',
          js_code: found.my_js_code ?? found.starter_js ?? '',
        })
      } else {
        setCode(found.my_code || found.starter_code || '')
      }
    }).catch(err => { if (active) setError(errorMessage(err)) })
    return () => { active = false }
  }, [classId, codespaceId, taskId])

  useClassActivity(codespace?.classroom_id, task ? {
    activity_type: 'codespace_task',
    activity_label: task.title,
    entity_type: 'coding_task',
    entity_id: task.id,
  } : null)

  useEffect(() => {
    const onKeyDown = event => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setFocusMode(current => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const runCode = async currentCode => {
    try {
      const { data } = await api.post('/code/run', { code: currentCode, language: task.language || 'python' })
      return data
    } catch (err) {
      throw new Error(errorMessage(err), { cause: err })
    }
  }
  const runTests = async currentCode => {
    try {
      const { data } = await api.post(`/coding-tasks/${taskId}/run`, { code: currentCode, language: task.language || 'python' })
      return data
    } catch (err) {
      throw new Error(errorMessage(err), { cause: err })
    }
  }

  const submit = async currentCode => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data } = await api.post(`/coding-tasks/${taskId}/submit`, { code: currentCode })
      setNotice('Submission saved.')
      setEvaluationStatus(data.evaluation_status || 'submitted')
      setBusy(false)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const submitWeb = async payload => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { data } = await api.post(`/coding-tasks/${taskId}/submit`, payload)
      setNotice('Submitted successfully.')
      setEvaluationStatus(data.evaluation_status || 'needs_review')
      setBusy(false)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const enterBrowserFullscreen = () => {
    document.documentElement.requestFullscreen?.()
  }

  if (error && !task) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!task) return <CodingTaskAttemptSkeleton />

  const workspace = <WorkspaceContent
    task={task}
    code={code}
    webCode={webCode}
    busy={busy}
    error={error}
    notice={notice}
    evaluationStatus={evaluationStatus}
    focusMode={focusMode}
    setCode={setCode}
    setWebCode={setWebCode}
    runCode={runCode}
    runTests={runTests}
    submit={submit}
    submitWeb={submitWeb}
  />

  if (focusMode) return <div className="codespace-focus-shell">
    <header className="codespace-focus-toolbar">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">Codespace Focus Mode</p>
        <h1 className="truncate text-base font-bold text-slate-950 sm:text-lg">{task.title}</h1>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={enterBrowserFullscreen}><MonitorUp size={16} />Browser Fullscreen</button>
        <button type="button" className="btn-primary" onClick={() => setFocusMode(false)}><Minimize2 size={16} />Exit Focus Mode</button>
      </div>
    </header>
    <main className="codespace-focus-workspace">
      {workspace}
    </main>
  </div>

  return <div className="mx-auto max-w-4xl">
    <Link className="back-link" to={codespace ? `/codespaces/${codespace.id}` : '/codespaces'}><ArrowLeft size={16} />Back to codespace</Link>
    <section className="mt-5 card overflow-hidden">
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase text-blue-700">{task.marks} marks</span>
          {task.due_at && <span className="text-xs font-semibold text-slate-500">Due {serverDate(task.due_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="page-title">{task.title}</h1>
          <button type="button" className="btn-secondary shrink-0" onClick={() => setFocusMode(true)}><Maximize2 size={16} />Focus Mode</button>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{task.description || 'Complete the coding task below.'}</p>
        {task.my_submission_status === 'evaluated' && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><b>Evaluated:</b> {task.my_marks_awarded ?? 0}/{task.marks} marks{task.my_feedback ? ` - ${task.my_feedback}` : ''}</div>}
      </div>
      <div className="border-t border-slate-200 bg-slate-50 p-6 sm:p-8">
        {workspace}
      </div>
    </section>
  </div>
}

function WorkspaceContent({ task, code, webCode, busy, error, notice, evaluationStatus, focusMode, setCode, setWebCode, runCode, runTests, submit, submitWeb }) {
  return <>
    {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}{evaluationStatus ? ` Evaluation status: ${evaluationStatus.replaceAll('_', ' ')}.` : ''}</p>}
    <Suspense fallback={<EditorWorkspaceSkeleton focusMode={focusMode} />}>
      {task.task_type === 'web'
        ? <WebCodeWorkspace
          initialHtml={webCode.html_code}
          initialCss={webCode.css_code}
          initialJs={webCode.js_code}
          starterHtml={task.starter_html || ''}
          starterCss={task.starter_css || ''}
          starterJs={task.starter_js || ''}
          onCodeChange={setWebCode}
          onSubmit={submitWeb}
          submitLabel={busy ? 'Submitting...' : 'Submit Code'}
          expectedOutput={task.expected_output}
          showExpectedOutput={Boolean(task.expected_output)}
          focusMode={focusMode}
        />
        : <PythonCodeWorkspace
          initialCode={code}
          starterCode={task.starter_code || ''}
          language={task.language || 'python'}
          onCodeChange={setCode}
          onRun={runCode}
          onRunTests={runTests}
          onSubmit={submit}
          submitLabel={busy ? 'Submitting...' : 'Submit Code'}
          expectedOutput={task.expected_output}
          showExpectedOutput={Boolean(task.expected_output)}
          focusMode={focusMode}
        />}
    </Suspense>
  </>
}

function serverDate(value) {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}

function CodingTaskAttemptSkeleton() {
  return <div className="mx-auto max-w-4xl">
    <div className="h-5 w-36 animate-pulse rounded bg-slate-200" />
    <section className="card mt-5 overflow-hidden">
      <div className="p-6 sm:p-8">
        <div className="h-6 w-24 animate-pulse rounded-full bg-slate-200" />
        <div className="mt-5 h-8 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="border-t border-slate-200 bg-slate-50 p-6 sm:p-8">
        <div className="h-[430px] animate-pulse rounded-xl bg-slate-200" />
        <div className="mt-4 flex gap-2">
          {[0, 1, 2].map(item => <div key={item} className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" />)}
        </div>
      </div>
    </section>
  </div>
}

function EditorWorkspaceSkeleton({ focusMode }) {
  return <div className={`grid gap-4 ${focusMode ? 'codespace-focus-web-grid' : 'xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]'}`}>
    <div className="h-[430px] animate-pulse rounded-xl bg-slate-200" />
    <div className="h-[430px] animate-pulse rounded-xl bg-slate-100" />
  </div>
}
