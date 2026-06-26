import { useEffect, useState } from 'react'
import api from '../api/axios'
import { SlowServerBanner } from './common/Loading'

export default function ServerWakeNotice() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    const connectingTimer = setTimeout(() => {
      if (active) setMessage('Connecting to ClassNest server...')
    }, 2000)
    const wakingTimer = setTimeout(() => {
      if (active) setMessage('Free server is waking up. Please wait a moment.')
    }, 15000)

    api.get('/health')
      .catch(() => {
        if (active) setMessage('Connecting to ClassNest server...')
      })
      .finally(() => {
        active = false
        clearTimeout(connectingTimer)
        clearTimeout(wakingTimer)
        setMessage('')
      })

    return () => {
      active = false
      clearTimeout(connectingTimer)
      clearTimeout(wakingTimer)
    }
  }, [])

  return <SlowServerBanner message={message} />
}
