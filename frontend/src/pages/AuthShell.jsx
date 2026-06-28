import { BookOpen } from 'lucide-react'

export default function AuthShell({ title, subtitle, children, footer }) {
  return <main className="auth-page">
    <div className="auth-mesh auth-mesh-blue" />
    <div className="auth-mesh auth-mesh-cyan" />
    <div className="auth-mesh auth-mesh-green" />
    <div className="auth-main">
      <div className="auth-main-inner">
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="flex flex-col items-center text-center">
            <div className="auth-logo">
              <BookOpen size={22} aria-hidden="true" />
            </div>
            <div className="mt-4 text-sm font-bold text-brand-700">ClassNest</div>
            <h1 id="auth-title" className="mt-5 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{subtitle}</p>
          </div>
          <div className="mt-8">{children}</div>
          <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>
        </section>
      </div>
    </div>
  </main>
}
