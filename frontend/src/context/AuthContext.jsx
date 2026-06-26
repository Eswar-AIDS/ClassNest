import { createContext, useContext, useEffect, useState } from 'react'
import api, { cacheKeys, getOnce, readSessionCache, removeSessionCache, writeSessionCache } from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const hasToken = Boolean(localStorage.getItem('classnest_token'))
  const [user, setUser] = useState(() => hasToken ? readSessionCache(cacheKeys.authMe) : null)
  const [loading, setLoading] = useState(() => hasToken && !readSessionCache(cacheKeys.authMe))

  const refresh = async () => {
    try {
      const nextUser = (await getOnce('/auth/me')).data
      setUser(nextUser)
      writeSessionCache(cacheKeys.authMe, nextUser)
    } catch {
      setUser(null)
      removeSessionCache(cacheKeys.authMe)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (localStorage.getItem('classnest_token')) queueMicrotask(refresh)
  }, [])

  const authenticate = async (path, data) => {
    const response = await api.post(path, data)
    localStorage.setItem('classnest_token', response.data.access_token)
    await refresh()
  }

  const logout = () => {
    localStorage.removeItem('classnest_token')
    removeSessionCache(cacheKeys.authMe)
    removeSessionCache(cacheKeys.dashboardClasses)
    setUser(null)
  }

  const value = {
    user,
    loading,
    login: data => authenticate('/auth/login', data),
    register: data => authenticate('/auth/register', data),
    logout,
    refresh,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// This hook intentionally lives beside its provider to keep auth state cohesive.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
