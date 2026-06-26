import { LoaderCircle, Wifi } from 'lucide-react'

export function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />
}

export function CardSkeleton({ className = '', lines = 3 }) {
  return <div className={`card p-5 ${className}`}>
    <SkeletonBlock className="h-4 w-24" />
    <SkeletonBlock className="mt-4 h-6 w-2/3" />
    <div className="mt-4 space-y-2">
      {Array.from({ length: lines }).map((_, index) => <SkeletonBlock key={index} className="h-3 w-full" />)}
    </div>
  </div>
}

export function TableSkeleton({ rows = 5, columns = 4, className = '' }) {
  return <div className={`card overflow-hidden ${className}`}>
    <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
      <SkeletonBlock className="h-5 w-36" />
    </div>
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, row) => <div key={row} className="grid gap-4 px-5 py-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((__, column) => <SkeletonBlock key={column} className="h-4 w-full" />)}
      </div>)}
    </div>
  </div>
}

export function ButtonLoader({ label = 'Loading...' }) {
  return <span className="inline-flex items-center gap-2">
    <LoaderCircle size={15} className="animate-spin" />
    {label}
  </span>
}

export function SectionLoader({ rows = 3, className = '' }) {
  return <section className={`mt-5 space-y-3 ${className}`} aria-busy="true">
    {Array.from({ length: rows }).map((_, index) => <CardSkeleton key={index} />)}
  </section>
}

export function FullPageLoader({ label = 'Loading ClassNest...' }) {
  return <main className="grid min-h-screen place-items-center px-4">
    <div className="text-center text-sm font-semibold text-slate-500">
      <LoaderCircle className="mx-auto mb-3 animate-spin text-brand-600" size={24} />
      {label}
    </div>
  </main>
}

export function SlowServerBanner({ message }) {
  if (!message) return null
  return <div className="fixed inset-x-0 top-3 z-50 flex justify-center px-4 pointer-events-none">
    <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-700 shadow-lift backdrop-blur">
      <Wifi size={15} className="text-brand-600" />
      {message}
    </div>
  </div>
}

export function PageHeaderSkeleton({ actions = false }) {
  return <div className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end">
    <div className="w-full max-w-xl space-y-3">
      <SkeletonBlock className="h-3 w-24" />
      <SkeletonBlock className="h-9 w-2/3" />
      <SkeletonBlock className="h-4 w-full max-w-md" />
    </div>
    {actions && <div className="flex gap-2">
      <SkeletonBlock className="h-10 w-28" />
      <SkeletonBlock className="h-10 w-32" />
    </div>}
  </div>
}

export function PageSkeleton({ actions = false, cards = 3, table = false }) {
  return <>
    <PageHeaderSkeleton actions={actions} />
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }).map((_, index) => <CardSkeleton key={index} className="min-h-40" />)}
    </div>
    {table && <TableSkeleton className="mt-6" rows={5} columns={4} />}
  </>
}

export function DashboardSkeleton() {
  return <>
    <PageHeaderSkeleton actions />
    <DashboardContentSkeleton />
  </>
}

export function DashboardContentSkeleton() {
  return <div className="mt-8 space-y-10">
    {[1, 2].map(section => <section key={section}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-5 w-28" />
          <SkeletonBlock className="h-4 w-56" />
        </div>
        <SkeletonBlock className="h-3 w-16" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map(item => <SkeletonBlock key={item} className="h-56 rounded-2xl" />)}
      </div>
    </section>)}
  </div>
}

export function ClassPageSkeleton() {
  return <>
    <SkeletonBlock className="h-56 rounded-2xl bg-brand-900/20" />
    <SkeletonBlock className="mt-5 h-28 rounded-2xl" />
    <section className="mt-8">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBlock className="h-5 w-32" />
          <SkeletonBlock className="h-4 w-64" />
        </div>
        <SkeletonBlock className="h-3 w-14" />
      </div>
      <div className="grid gap-3">
        {[1, 2, 3].map(item => <SkeletonBlock key={item} className="h-24 rounded-2xl" />)}
      </div>
    </section>
  </>
}

export function UnitPageSkeleton() {
  return <>
    <SkeletonBlock className="h-5 w-32" />
    <PageHeaderSkeleton />
    <div className="mt-8 grid gap-9 lg:grid-cols-2 lg:gap-8">
      {[1, 2].map(section => <section key={section}>
        <div className="mb-4 flex min-h-12 items-start justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-4 w-56" />
          </div>
          <SkeletonBlock className="h-10 w-28" />
        </div>
        <div className="grid gap-3">
          {[1, 2, 3].map(item => <SkeletonBlock key={item} className="h-28 rounded-2xl" />)}
        </div>
      </section>)}
    </div>
  </>
}

export function AssessmentPageSkeleton() {
  return <div className="mx-auto max-w-3xl">
    <section className="card overflow-hidden">
      <div className="p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SkeletonBlock className="h-7 w-24 rounded-full" />
          <SkeletonBlock className="h-4 w-44" />
        </div>
        <SkeletonBlock className="mt-5 h-9 w-2/3" />
        <SkeletonBlock className="mt-3 h-4 w-full" />
        <SkeletonBlock className="mt-2 h-4 w-5/6" />
        <div className="mt-7 grid grid-cols-2 divide-x rounded-xl border border-slate-200 bg-slate-50">
          <div className="p-4"><SkeletonBlock className="h-12 w-full" /></div>
          <div className="p-4"><SkeletonBlock className="h-12 w-full" /></div>
        </div>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 sm:px-8">
        <SkeletonBlock className="h-10 w-48" />
      </div>
    </section>
  </div>
}

export function LoginSkeleton() {
  return <div className="space-y-5">
    <SkeletonBlock className="h-16" />
    <SkeletonBlock className="h-16" />
    <SkeletonBlock className="h-11" />
  </div>
}
