import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DashboardSkeleton } from './LoadingSkeletons'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <main className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 md:px-8 md:py-9"><DashboardSkeleton /></main>
  }

  return user
    ? <Outlet />
    : <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
}
