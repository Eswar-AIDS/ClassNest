export default function QuestionCard({ question, index, value, onChange, review }) {
  const options = ['A', 'B', 'C', 'D']

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
    <div className="mb-5 flex items-start gap-3">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
      <p className="pt-0.5 font-semibold leading-6 text-slate-900">{question.question}</p>
    </div>
    <div className="space-y-2.5">
      {options.map(key => {
        const selected = value === key
        const correct = review && question.correct_option === key
        const wrong = review && selected && !correct
        return <label key={key} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-sm leading-5 transition ${correct ? 'border-emerald-400 bg-emerald-50' : wrong ? 'border-red-300 bg-red-50' : selected ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
          <input className="sr-only" disabled={!!review} type="radio" name={`q-${question.id}`} checked={selected} onChange={() => onChange?.(key)} />
          <span className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${correct ? 'border-emerald-600 bg-emerald-600 text-white' : wrong ? 'border-red-500 bg-red-500 text-white' : selected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-500'}`}>{key}</span>
          <span className="pt-0.5 text-slate-700">{question[`option_${key.toLowerCase()}`]}</span>
        </label>
      })}
    </div>
    {review && <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600"><b className="text-slate-900">Explanation:</b> {review.explanation || 'No explanation provided.'}</div>}
  </section>
}
