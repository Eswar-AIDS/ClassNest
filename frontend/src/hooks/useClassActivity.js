import { useEffect, useRef } from 'react'
import api from '../api/axios'

export default function useClassActivity(classId, activityPayload) {
  const payloadRef = useRef(activityPayload)

  useEffect(() => {
    payloadRef.current = activityPayload
  }, [activityPayload])

  useEffect(() => {
    if (!classId || !activityPayload?.activity_type) return undefined
    let cancelled = false
    let timer

    const sendActivity = async () => {
      if (cancelled || document.hidden || !payloadRef.current?.activity_type) return
      try {
        await api.post(`/classes/${classId}/activity`, {
          ...payloadRef.current,
          route_path: payloadRef.current.route_path || `${window.location.pathname}${window.location.search}`,
        })
      } catch {
        // Activity tracking should stay invisible to the learner workflow.
      }
    }

    const startHeartbeat = () => {
      clearInterval(timer)
      if (document.hidden) return
      sendActivity()
      timer = setInterval(sendActivity, 30000)
    }

    const handleVisibility = () => {
      if (document.hidden) clearInterval(timer)
      else startHeartbeat()
    }

    startHeartbeat()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [classId, activityPayload?.activity_type])
}
