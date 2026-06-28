import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import api, { errorMessage } from '../api/axios'

export default function CodingTaskSubmissions() {
  const { classId, codespaceId, taskId } = useParams()
  const [codespace, setCodespace] = useState(null)
  const [task, setTask] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [drafts, setDrafts] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const url = codespaceId ? `/codespaces/${codespaceId}` : `/classes/${classId}/codespace`
    api.get(url).then(async response => {
      const [taskResponse, submissionsResponse] = await Promise.all([
        api.get(`/coding-tasks/${taskId}`),
        api.get(`/coding-tasks/${taskId}/submissions`, { params: { limit: 25, offset: 0 } }),
      ])
      if (!active) return
      setCodespace(response.data)
      setTask(taskResponse.data)
      setSubmissions(submissionsResponse.data)
      setDrafts(Object.fromEntries(submissionsResponse.data.map(item => [item.id, { marks_awarded: item.final_marks ?? item.marks_awarded ?? '', feedback: item.feedback || item.evaluation_feedback || '' }])))
    }).catch(err => { if (active) setError(errorMessage(err)) })
    return () => { active = false }
  }, [classId, codespaceId, taskId])

  const updateDraft = (id, patch) => setDrafts(current => ({ ...current, [id]: { ...current[id], ...patch } }))
  const save = async submission => {
    setError('')
    const draft = drafts[submission.id]
    try {
      const { data } = await api.put(`/coding-submissions/${submission.id}/evaluate`, { marks_awarded: Number(draft.marks_awarded), feedback: draft.feedback })
      setSubmissions(current => current.map(item => item.id === data.id ? { ...item, ...data, student_name: item.student_name, student_email: item.student_email } : item))
    } catch (err) { setError(errorMessage(err)) }
  }

  if (error && !task) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>
  if (!task) return <div className="card p-6 text-sm text-slate-500">Loading submissions...</div>

  return <div>
    <Link className="back-link" to={codespace ? `/codespaces/${codespace.id}` : '/codespaces'}><ArrowLeft size={16} />Back to codespace</Link>
    <section className="mt-5 card p-6 sm:p-8">
      <h1 className="page-title">{task.title}</h1>
      <p className="mt-2 text-sm text-slate-500">Review submitted code and save marks with feedback.</p>
    </section>
    {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="mt-6 grid gap-4">
      {submissions.map(submission => <SubmissionCard key={submission.id} submission={submission} task={task} draft={drafts[submission.id]} updateDraft={updateDraft} save={save} />)}
      {!submissions.length && <div className="empty-state">No submissions yet.</div>}
    </section>
  </div>
}

function SubmissionCard({ submission, task, draft, updateDraft, save }) {
  const [activeTab, setActiveTab] = useState(task.task_type === 'web' ? 'html' : 'python')
  const [detail, setDetail] = useState(null)
  const [loadingCode, setLoadingCode] = useState(false)
  const [codeError, setCodeError] = useState('')
  const visibleSubmission = detail || submission
  const loadCode = async () => {
    if (detail || loadingCode) return
    setLoadingCode(true)
    setCodeError('')
    try {
      const { data } = await api.get(`/coding-submissions/${submission.id}`)
      setDetail(data)
    } catch (err) {
      setCodeError(errorMessage(err))
    } finally {
      setLoadingCode(false)
    }
  }
  return <article className="card overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 bg-white p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-bold text-slate-950">{submission.student_name || `Student #${submission.student_id}`}</h2>
            <p className="mt-1 text-xs text-slate-500">{submission.student_email} · Submitted {serverDate(submission.submitted_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
          <span className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ${submission.evaluation_status?.includes('evaluated') ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{submission.evaluation_status || submission.status}</span>
        </div>
        <div className="grid gap-0 lg:grid-cols-[1.2fr_.8fr]">
          {detail ? task.task_type === 'web'
            ? <WebSubmissionViewer submission={visibleSubmission} activeTab={activeTab} setActiveTab={setActiveTab} />
            : <pre className="max-h-[460px] overflow-auto bg-slate-950 p-5 text-xs leading-5 text-slate-100"><code>{visibleSubmission.code}</code></pre>
            : <div className="grid min-h-[280px] place-items-center bg-slate-950 p-5 text-center text-sm text-slate-300">
              <div>
                <p className="font-semibold text-white">Submission code is loaded on demand.</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">Marks, status, and feedback stay visible without downloading full source code for every student.</p>
                {codeError && <p className="mt-3 rounded-lg border border-red-900/70 bg-red-950/40 p-3 text-xs text-red-200">{codeError}</p>}
                <button type="button" className="btn-primary mt-4" onClick={loadCode} disabled={loadingCode}>{loadingCode ? 'Loading code...' : 'View submitted code'}</button>
              </div>
            </div>}
          <div className="space-y-4 border-t border-slate-200 p-5 lg:border-l lg:border-t-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">Auto marks</p><p className="mt-1 text-lg font-bold text-slate-950">{submission.auto_marks ?? '-'}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-semibold uppercase text-slate-500">Final marks</p><p className="mt-1 text-lg font-bold text-slate-950">{submission.final_marks ?? '-'}</p></div>
            </div>
            {submission.evaluation_feedback && <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-800">{submission.evaluation_feedback}</div>}
            <label><span className="label">Manual marks</span><input className="field" type="number" min="0" max={task.marks} value={draft?.marks_awarded ?? ''} onChange={event => updateDraft(submission.id, { marks_awarded: event.target.value })} /></label>
            <label><span className="label">Feedback</span><textarea className="field resize-y" rows="6" value={draft?.feedback ?? ''} onChange={event => updateDraft(submission.id, { feedback: event.target.value })} /></label>
            <button className="btn-primary" onClick={() => save(submission)} disabled={draft?.marks_awarded === ''}><Save size={16} />Save evaluation</button>
          </div>
        </div>
      </article>
}

function WebSubmissionViewer({ submission, activeTab, setActiveTab }) {
  const tabs = [
    ['html', 'HTML'],
    ['css', 'CSS'],
    ['js', 'JavaScript'],
    ['preview', 'Preview'],
  ]
  const code = {
    html: submission.html_code || '',
    css: submission.css_code || '',
    js: submission.js_code || '',
  }
  return <div className="min-h-[460px] bg-slate-950">
    <div className="flex flex-wrap gap-1 border-b border-slate-800 bg-slate-900 p-2">
      {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => setActiveTab(key)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${activeTab === key ? 'bg-white text-slate-950' : 'bg-slate-800 text-slate-300'}`}>{label}</button>)}
    </div>
    {activeTab === 'preview'
      ? <iframe title={`Submission ${submission.id} preview`} sandbox="allow-scripts" srcDoc={submission.preview_snapshot || buildPreview(code.html, code.css, code.js)} className="h-[430px] w-full bg-white" />
      : <pre className="max-h-[430px] overflow-auto p-5 text-xs leading-5 text-slate-100"><code>{code[activeTab]}</code></pre>}
  </div>
}

function buildPreview(htmlCode, cssCode, jsCode) {
  const safeJsCode = JSON.stringify(jsCode || '')
  return `<!doctype html><html><head><meta charset="utf-8" /><style>${cssCode}</style></head><body>${htmlCode}<script>
function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, function (char) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char];
  });
}
function showPreviewError(error) {
  var message = error && error.stack ? error.stack : error;
  document.body.insertAdjacentHTML('beforeend', '<pre style="color:red;white-space:pre-wrap;border:1px solid #fecaca;background:#fef2f2;padding:12px;">' + escapeHtml(message) + '</pre>');
}
function createSafeStorage(name) {
  var store = {};
  var warned = false;
  function warnOnce() {
    if (!warned) {
      warned = true;
      console.warn(name + ' is blocked in this preview sandbox. Using temporary in-memory storage instead.');
    }
  }
  return {
    getItem: function (key) { warnOnce(); return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
    setItem: function (key, value) { warnOnce(); store[key] = String(value); },
    removeItem: function (key) { warnOnce(); delete store[key]; },
    clear: function () { warnOnce(); store = {}; },
    key: function (index) { warnOnce(); return Object.keys(store)[index] || null; },
    get length() { return Object.keys(store).length; }
  };
}
var safeLocalStorage = createSafeStorage('localStorage');
var safeSessionStorage = createSafeStorage('sessionStorage');
window.safeLocalStorageGet = function (key) { return safeLocalStorage.getItem(key); };
window.safeLocalStorageSet = function (key, value) { safeLocalStorage.setItem(key, value); };
try {
  Object.defineProperty(window, 'localStorage', { value: safeLocalStorage, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: safeSessionStorage, configurable: true });
} catch (error) {
  console.warn('localStorage is blocked in this preview sandbox.');
}
document.addEventListener('DOMContentLoaded', function () {
  try {
    new Function('safeLocalStorageGet', 'safeLocalStorageSet', ${safeJsCode})(window.safeLocalStorageGet, window.safeLocalStorageSet);
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    showPreviewError(error);
  }
});
</script></body></html>`
}

function serverDate(value) {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`)
}
