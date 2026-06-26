import { BookOpen, GraduationCap } from 'lucide-react'

export default function AuthShell({ title, subtitle, children, footer }) {
  return <main className="auth-page">
    <div className="auth-glow auth-glow-blue" />
    <div className="auth-glow auth-glow-green" />
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="flex flex-col items-center text-center">
        <div className="auth-logo">
          <BookOpen size={22} aria-hidden="true" />
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm font-bold text-brand-700">
          <GraduationCap size={16} aria-hidden="true" />
          <span>ClassNest</span>
        </div>
        <h1 id="auth-title" className="mt-5 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{subtitle}</p>
      </div>
      <div className="mt-8">{children}</div>
      <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
    </section>
  </main>
}
