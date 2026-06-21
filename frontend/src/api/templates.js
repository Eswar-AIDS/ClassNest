import api from './axios'

async function downloadTemplate(path, fileName) {
  const response = await api.get(path, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export const downloadAssessmentImportTemplate = () => downloadTemplate('/templates/assessment-import', 'ClassNest_Assessment_Clean_Template.xlsx')
export const downloadAnswerKeyEvaluationTemplate = () => downloadTemplate('/templates/answer-key-evaluation', 'ClassNest_AnswerKey_Evaluation_Template.xlsx')
