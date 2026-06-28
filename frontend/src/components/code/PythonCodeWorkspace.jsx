import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { CheckCircle2, LoaderCircle, Play, RotateCcw, Save, Send, Terminal, XCircle } from 'lucide-react'

export default function PythonCodeWorkspace({
  initialCode = '',
  starterCode = '',
  language = 'python',
  readOnly = false,
  onCodeChange,
  onRun,
  onRunTests,
  onSubmit,
  submitLabel = 'Submit Code',
  expectedOutput = '',
  showExpectedOutput = false,
  autoSaveStatus = '',
  focusMode = false,
}) {
  const [code, setCode] = useState(initialCode || starterCode || '')
  const [result, setResult] = useState(null)
  const [testResult, setTestResult] = useState(null)
  const [runError, setRunError] = useState('')
  const [testError, setTestError] = useState('')
  const [running, setRunning] = useState(false)
  const [testing, setTesting] = useState(false)
  const [executionStatus, setExecutionStatus] = useState('')
  const [activeOutput, setActiveOutput] = useState('terminal')

  const updateCode = value => {
    const next = value || ''
    setCode(next)
    onCodeChange?.(next)
  }

  const runCode = async () => {
    if (!onRun || !code.trim()) return
    setRunning(true)
    setExecutionStatus('Running...')
    setRunError('')
    setResult(null)
    setActiveOutput('terminal')
    try {
      const output = await onRun(code)
      setResult(output)
      setExecutionStatus(output?.status === 'timeout' ? 'Error' : output?.stderr || output?.status === 'error' ? 'Error' : 'Completed')
    } catch (err) {
      setRunError(err?.message || 'Unable to run code')
      setExecutionStatus('Error')
    } finally {
      setRunning(false)
    }
  }

  const runTests = async () => {
    if (!onRunTests || !code.trim()) return
    setTesting(true)
    setExecutionStatus('Running...')
    setTestError('')
    setTestResult(null)
    setActiveOutput('tests')
    try {
      const output = await onRunTests(code)
      setTestResult(output)
      setExecutionStatus(output?.stderr || output?.error_type || output?.success === false ? 'Error' : 'Completed')
    } catch (err) {
      setTestError(err?.message || 'Unable to run tests')
      setExecutionStatus('Error')
    } finally {
      setTesting(false)
    }
  }

  const reset = () => {
    updateCode(starterCode || '')
    setResult(null)
    setTestResult(null)
    setRunError('')
    setTestError('')
    setExecutionStatus('')
  }
  const editorHeight = focusMode ? 'min(58vh, calc(100vh - 330px))' : '380px'

  return <div className="space-y-4">
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{language === 'python' ? 'Python editor' : `${language} editor`}</span>
        <span className="text-[11px] text-slate-400">{autoSaveStatus || '4 spaces · line numbers'}</span>
      </div>
      <Editor height={editorHeight} language={language} theme="vs" value={code} onChange={updateCode} loading={<div className="grid h-[380px] place-items-center text-sm text-slate-500">Loading editor...</div>} options={{
        automaticLayout: true,
        lineNumbers: 'on',
        minimap: { enabled: false },
        insertSpaces: true,
        tabSize: 4,
        detectIndentation: false,
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        fontSize: 14,
        padding: { top: 14, bottom: 14 },
        formatOnPaste: true,
        readOnly,
      }} />
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={readOnly || running || testing || !onRun || !code.trim()} onClick={runCode} className="btn-primary"><Play size={15} />{onRun ? running ? 'Running...' : 'Run Code' : 'Run code coming soon'}</button>
      <button type="button" disabled={readOnly || running || testing || !onRunTests || !code.trim()} onClick={runTests} className="btn-secondary"><Play size={15} />{onRunTests ? testing ? 'Running tests...' : 'Run Tests' : 'Run tests coming soon'}</button>
      <button type="button" disabled={readOnly || running || testing} onClick={reset} className="btn-secondary"><RotateCcw size={15} />Reset starter code</button>
      {onSubmit && <button type="button" disabled={readOnly || running || testing || !code.trim()} onClick={() => onSubmit(code)} className="btn-primary"><Send size={15} />{submitLabel}</button>}
      {autoSaveStatus && <span className="text-xs font-semibold text-emerald-700"><Save size={13} className="mr-1 inline" />{autoSaveStatus}</span>}
      {executionStatus && <span className={`text-xs font-bold ${executionStatus === 'Error' ? 'text-red-600' : executionStatus === 'Completed' ? 'text-emerald-700' : 'text-slate-500'}`}>{executionStatus}</span>}
    </div>

    {showExpectedOutput && expectedOutput && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Expected output / evaluation rule</p>
      <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-6 text-slate-700">{expectedOutput}</pre>
    </div>}

    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setActiveOutput('terminal')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${activeOutput === 'terminal' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>Terminal Output</button>
      <button type="button" onClick={() => setActiveOutput('tests')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${activeOutput === 'tests' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>Test Results</button>
    </div>
    {activeOutput === 'terminal'
      ? <TerminalOutput running={running} error={runError} result={result} />
      : <TestOutput running={testing} error={testError} result={testResult} />}
  </div>
}

function TerminalOutput({ running, error, result }) {
  const noOutput = result?.status === 'completed' && !result.stdout && !result.stderr
  return <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-100">
    <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-300"><Terminal size={15} />Terminal</span>
      {result && <span className="text-[11px] text-slate-500">{result.execution_time_ms} ms</span>}
    </header>
    <div className="min-h-28 space-y-4 p-4">
      {running && <p className="flex items-center gap-2 text-sm text-slate-300"><LoaderCircle size={16} className="animate-spin" />Running...</p>}
      {!running && !error && !result && <p className="text-sm text-slate-500">Run Code to execute this file like a local Python script.</p>}
      {error && <p className="whitespace-pre-wrap text-sm text-red-300">{error}</p>}
      {result?.stderr && <pre className="whitespace-pre-wrap rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs leading-6 text-red-200">{result.stderr}</pre>}
      {result?.stdout && <div><p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Standard output</p><pre className="whitespace-pre-wrap text-xs leading-6 text-slate-200">{result.stdout}</pre></div>}
      {noOutput && <p className="text-sm text-emerald-300">No output. Use print() to display results.</p>}
    </div>
  </section>
}

function TestOutput({ running, error, result }) {
  const message = result?.error_type === 'IndentationError' ? 'IndentationError: check spaces/tabs and block indentation.' : result?.stderr
  return <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-100">
    <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
      <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-300"><Terminal size={15} />Test Results</span>
      {result && <span className="text-[11px] text-slate-500">{result.execution_time_ms} ms</span>}
    </header>
    <div className="min-h-28 space-y-4 p-4">
      {running && <p className="flex items-center gap-2 text-sm text-slate-300"><LoaderCircle size={16} className="animate-spin" />Running tests...</p>}
      {!running && !error && !result && <p className="text-sm text-slate-500">Run Tests to evaluate visible test cases without writing print statements.</p>}
      {error && <p className="whitespace-pre-wrap text-sm text-red-300">{error}</p>}
      {message && <pre className="whitespace-pre-wrap rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs leading-6 text-red-200">{message}</pre>}
      {result?.stdout && <div><p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Standard output</p><pre className="whitespace-pre-wrap text-xs leading-6 text-slate-200">{result.stdout}</pre></div>}
      {result && !result.stderr && !result.stdout && !result.test_case_results.length && <p className="text-sm text-emerald-300">Code ran without output.</p>}
      {result?.test_case_results.length > 0 && <div className="space-y-2">{result.test_case_results.map(test => <div key={test.index} className={`rounded-lg border p-3 ${test.passed ? 'border-emerald-900 bg-emerald-950/30' : 'border-red-900 bg-red-950/30'}`}>
        <div className="flex items-center gap-2 text-xs font-bold">{test.passed ? <CheckCircle2 size={15} className="text-emerald-400" /> : <XCircle size={15} className="text-red-400" />}Visible test {test.index}: {test.passed ? 'Passed' : 'Failed'}</div>
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3"><p><span className="text-slate-500">Input</span><br /><code>{test.input}</code></p><p><span className="text-slate-500">Expected</span><br /><code>{test.expected}</code></p><p><span className="text-slate-500">Actual</span><br /><code>{test.actual ?? 'No result'}</code></p></div>
        {test.error && <p className="mt-2 text-xs text-red-300">{test.error}</p>}
      </div>)}</div>}
    </div>
  </section>
}
