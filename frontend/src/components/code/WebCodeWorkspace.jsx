import { useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Eye, Play, RotateCcw, Save, Send, Terminal } from 'lucide-react'

export default function WebCodeWorkspace({
  initialHtml = '',
  initialCss = '',
  initialJs = '',
  starterHtml = '',
  starterCss = '',
  starterJs = '',
  readOnly = false,
  onCodeChange,
  onSubmit,
  submitLabel = 'Submit Code',
  expectedOutput = '',
  showExpectedOutput = false,
  autoSaveStatus = '',
  focusMode = false,
}) {
  const [htmlCode, setHtmlCode] = useState(initialHtml || starterHtml || '')
  const [cssCode, setCssCode] = useState(initialCss || starterCss || '')
  const [jsCode, setJsCode] = useState(initialJs || starterJs || '')
  const [previewKey, setPreviewKey] = useState(0)
  const [activeEditor, setActiveEditor] = useState('html')
  const [previewLogs, setPreviewLogs] = useState([])

  const srcDoc = useMemo(() => buildPreview(htmlCode, cssCode, jsCode), [htmlCode, cssCode, jsCode])

  useEffect(() => {
    const onMessage = event => {
      const data = event.data
      if (!data || data.source !== 'classnest-preview') return
      setPreviewLogs(current => [...current, {
        id: `${Date.now()}-${current.length}`,
        type: data.type || 'log',
        message: data.message || '',
      }])
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const refreshPreview = () => {
    setPreviewLogs([])
    setPreviewKey(key => key + 1)
  }

  const update = (field, value) => {
    const next = value || ''
    const payload = { html_code: htmlCode, css_code: cssCode, js_code: jsCode, [field]: next }
    if (field === 'html_code') setHtmlCode(next)
    if (field === 'css_code') setCssCode(next)
    if (field === 'js_code') setJsCode(next)
    onCodeChange?.(payload)
  }

  const reset = () => {
    setHtmlCode(starterHtml || '')
    setCssCode(starterCss || '')
    setJsCode(starterJs || '')
    onCodeChange?.({ html_code: starterHtml || '', css_code: starterCss || '', js_code: starterJs || '' })
    setPreviewLogs([])
    setPreviewKey(key => key + 1)
  }

  const submit = () => onSubmit?.({ html_code: htmlCode, css_code: cssCode, js_code: jsCode, preview_snapshot: srcDoc })

  const editors = {
    html: { label: 'HTML', language: 'html', value: htmlCode, field: 'html_code' },
    css: { label: 'CSS', language: 'css', value: cssCode, field: 'css_code' },
    js: { label: 'JavaScript', language: 'javascript', value: jsCode, field: 'js_code' },
  }
  const current = editors[activeEditor]
  const editorHeight = focusMode ? 'calc(100vh - 260px)' : '430px'
  const previewHeight = focusMode ? 'calc(100vh - 260px)' : '430px'

  return <div className="space-y-4">
    <div className={`grid gap-4 ${focusMode ? 'codespace-focus-web-grid' : 'xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]'}`}>
      <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {Object.entries(editors).map(([key, editor]) => <button key={key} type="button" onClick={() => setActiveEditor(key)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${activeEditor === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{editor.label}</button>)}
          </div>
          <span className="text-[11px] text-slate-400">{autoSaveStatus || 'Client-side preview'}</span>
        </div>
        <Editor height={editorHeight} language={current.language} theme="vs" value={current.value} onChange={value => update(current.field, value)} loading={<div className="grid h-[430px] place-items-center text-sm text-slate-500">Loading editor...</div>} options={{
          automaticLayout: true,
          lineNumbers: 'on',
          minimap: { enabled: false },
          tabSize: 2,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          fontSize: 14,
          padding: { top: 14, bottom: 14 },
          formatOnPaste: true,
          readOnly,
        }} />
        {activeEditor === 'js' && <p className="border-t border-slate-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Preview runs inside a secure sandbox. Browser storage APIs like localStorage may be restricted.</p>}
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
          <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Eye size={15} />Preview</span>
          <button type="button" disabled={readOnly} onClick={refreshPreview} className="btn-secondary py-1.5 text-xs"><Play size={14} />Run / Refresh</button>
        </div>
        <iframe key={previewKey} title="Web codespace preview" sandbox="allow-scripts" srcDoc={srcDoc} className="w-full bg-white" style={{ height: previewHeight }} />
      </section>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={readOnly} onClick={refreshPreview} className="btn-primary"><Play size={15} />Run / Refresh Preview</button>
      <button type="button" disabled={readOnly} onClick={reset} className="btn-secondary"><RotateCcw size={15} />Reset starter code</button>
      {onSubmit && <button type="button" disabled={readOnly || (!htmlCode.trim() && !cssCode.trim() && !jsCode.trim())} onClick={submit} className="btn-primary"><Send size={15} />{submitLabel}</button>}
      {autoSaveStatus && <span className="text-xs font-semibold text-emerald-700"><Save size={13} className="mr-1 inline" />{autoSaveStatus}</span>}
    </div>

    {showExpectedOutput && expectedOutput && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Expected output / evaluation rule</p>
      <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-6 text-slate-700">{expectedOutput}</pre>
    </div>}

    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-100">
      <header className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-300"><Terminal size={15} />Console</header>
      <div className="min-h-24 space-y-2 p-4 text-sm">
        {!previewLogs.length && <p className="text-slate-500">Run the preview to see console.log, warnings, and JavaScript errors here.</p>}
        {previewLogs.map(log => <pre key={log.id} className={`whitespace-pre-wrap rounded-lg border p-3 text-xs leading-5 ${log.type === 'error' ? 'border-red-900/70 bg-red-950/40 text-red-200' : log.type === 'warn' ? 'border-amber-900/70 bg-amber-950/30 text-amber-200' : 'border-slate-800 bg-slate-900 text-slate-200'}`}><span className="mr-2 font-bold uppercase">{log.type}</span>{log.message}</pre>)}
      </div>
    </section>
  </div>
}

function buildPreview(htmlCode, cssCode, jsCode) {
  const safeJsCode = JSON.stringify(jsCode || '')
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
${cssCode}
</style>
</head>
<body>
${htmlCode}
<script>
window.__classnestLogs = [];

function sendLog(type, args) {
  try {
    var message = args.map(function (arg) {
      if (arg instanceof Error) return arg.stack || arg.message;
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); } catch (error) { return String(arg); }
      }
      return String(arg);
    }).join(' ');

    window.__classnestLogs.push({ type: type, message: message });
    window.parent.postMessage({
      source: 'classnest-preview',
      type: type,
      message: message
    }, '*');
  } catch (error) {}
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, function (char) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char];
  });
}

function showPreviewError(error) {
  var message = error && error.stack ? error.stack : error;
  document.body.insertAdjacentHTML(
    'beforeend',
    '<pre style="color:red;white-space:pre-wrap;border:1px solid #fecaca;background:#fef2f2;padding:12px;">' + escapeHtml(message) + '</pre>'
  );
}

['log', 'warn', 'error'].forEach(function (type) {
  var original = console[type];
  console[type] = function () {
    var args = Array.from(arguments);
    sendLog(type, args);
    if (original) original.apply(console, args);
  };
});

window.addEventListener('error', function (event) {
  sendLog('error', [event.message]);
});

window.addEventListener('unhandledrejection', function (event) {
  sendLog('error', ['Unhandled Promise Rejection: ' + event.reason]);
});

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
    new Function('safeLocalStorageGet', 'safeLocalStorageSet', ${safeJsCode})(
      window.safeLocalStorageGet,
      window.safeLocalStorageSet
    );
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    showPreviewError(error);
  }
});
</script>
</body>
</html>`
}
