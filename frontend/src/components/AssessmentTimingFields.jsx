export default function AssessmentTimingFields({ form, setForm, disabled = false }) {
  const timed = ['timed', 'timed_deadline'].includes(form.timing_mode)
  const deadline = ['deadline', 'timed_deadline'].includes(form.timing_mode)
  return <section className="rounded-xl border border-slate-200 p-4">
    <p className="text-sm font-bold text-slate-900">Assessment timing</p>
    <div className="mt-3 grid gap-2">
      {[
        ['untimed', 'No time limit'],
        ['timed', 'Time limit'],
        ['deadline', 'Deadline'],
        ['timed_deadline', 'Time limit + deadline'],
      ].map(([value, label]) => <label key={value} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-semibold"><input type="radio" name="timing_mode" disabled={disabled} checked={form.timing_mode === value} onChange={() => setForm({ ...form, timing_mode: value })} />{label}</label>)}
    </div>
    {timed && <label className="mt-4 block"><span className="label">Duration minutes</span><input className="field" type="number" min="1" max="600" required disabled={disabled} value={form.duration_minutes} onChange={event => setForm({ ...form, duration_minutes: Number(event.target.value) })} /></label>}
    {deadline && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="label">Opens at (optional)</span><input className="field" type="datetime-local" disabled={disabled} value={form.starts_at} onChange={event => setForm({ ...form, starts_at: event.target.value })} /></label><label><span className="label">Closes at</span><input className="field" type="datetime-local" required disabled={disabled} value={form.ends_at} onChange={event => setForm({ ...form, ends_at: event.target.value })} /></label></div>}
    {form.timing_mode === 'untimed' && <p className="mt-3 text-xs text-slate-500">Students can submit while responses are open. No timer is shown.</p>}
  </section>
}
