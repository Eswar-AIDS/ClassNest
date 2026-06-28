import { useEffect, useState } from 'react'
import api, { subscribeSlowRequests } from '../api/axios'
import { SlowServerBanner } from './common/Loading'

export default function ServerWakeNotice() {
  const [healthMessage, setHealthMessage] = useState('')
  const [slowRequestMessage, setSlowRequestMessage] = useState('')

  useEffect(() => {
    let active = true
    const connectingTimer = setTimeout(() => {
      if (active) setHealthMessage('Connecting to ClassNest server...')
    }, 2000)
    const wakingTimer = setTimeout(() => {
      if (active) setHealthMessage('Free server is waking up. Please wait a moment.')
    }, 15000)

    api.get('/health')
      .catch(() => {
        if (active) setHealthMessage('Connecting to ClassNest server...')
      })
      .finally(() => {
        active = false
        clearTimeout(connectingTimer)
        clearTimeout(wakingTimer)
        setHealthMessage('')
      })

    return () => {
      active = false
      clearTimeout(connectingTimer)
      clearTimeout(wakingTimer)
    }
  }, [])

  useEffect(() => subscribeSlowRequests(count => {
    if (count > 0) setSlowRequestMessage('Connecting to ClassNest server...')
    else setSlowRequestMessage('')
  }), [])

  return <SlowServerBanner message={healthMessage || slowRequestMessage} />
}
