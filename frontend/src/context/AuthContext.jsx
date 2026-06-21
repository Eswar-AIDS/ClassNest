import { createContext, useContext, useEffect, useState } from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      setUser((await api.get('/auth/me')).data)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    api.get('/auth/me')
      .then(response => setUser(response.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const authenticate = async (path, data) => {
    const response = await api.post(path, data)
    localStorage.setItem('classnest_token', response.data.access_token)
    await refresh()
  }

  const logout = () => {
    localStorage.removeItem('classnest_token')
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
