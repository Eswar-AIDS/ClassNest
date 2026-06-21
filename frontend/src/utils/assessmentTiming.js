export function timingPayload(form) {
  const timed = ['timed', 'timed_deadline'].includes(form.timing_mode)
  const deadline = ['deadline', 'timed_deadline'].includes(form.timing_mode)
  return {
    title: form.title,
    description: form.description,
    timing_mode: form.timing_mode,
    duration_minutes: timed ? Number(form.duration_minutes) : null,
    starts_at: deadline && form.starts_at ? new Date(form.starts_at).toISOString() : null,
    ends_at: deadline && form.ends_at ? new Date(form.ends_at).toISOString() : null,
  }
}
