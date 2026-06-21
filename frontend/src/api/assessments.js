import api from './axios'

export const importAnswerKey = (assessmentId, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post(`/assessments/${assessmentId}/import-answer-key`, formData)
}
