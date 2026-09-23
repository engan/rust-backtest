export type ResearchJobSnapshot = {
  id: string
  kind: 'optimization' | 'monte_carlo'
  status: 'queued' | 'running' | 'completed' | 'failed'
  stage: string
  completed: number
  total: number
  percent: number
  message: string
  createdAt: string
  reportUrl?: string | null
  error?: string | null
}

const jsonRequest = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init)
  const text = await response.text()
  let body: (T & { error?: string }) | null = null
  if (text) {
    try {
      body = JSON.parse(text) as T & { error?: string }
    } catch {
      // A stopped proxy or an upstream error can return HTML instead of JSON.
    }
  }
  if (!response.ok) throw new Error(body?.error || `Research service returned HTTP ${response.status} ${response.statusText}`.trim())
  if (!body) throw new Error('Research service returned an empty or invalid response.')
  return body
}

export const researchServerHealth = () => jsonRequest<{ status: string }>('/research-api/health')

export const createResearchJob = (request: unknown) =>
  jsonRequest<ResearchJobSnapshot>('/research-api/research/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

export const createMonteCarloJob = (request: unknown) =>
  jsonRequest<ResearchJobSnapshot>('/research-api/monte-carlo/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

export const getResearchJob = (id: string) =>
  jsonRequest<ResearchJobSnapshot>(`/research-api/jobs/${encodeURIComponent(id)}`)

export const getResearchReport = <T = unknown>(id: string) =>
  jsonRequest<T>(`/research-api/jobs/${encodeURIComponent(id)}/report`)

export const waitForResearchJob = async (
  id: string,
  onProgress: (job: ResearchJobSnapshot) => void,
): Promise<ResearchJobSnapshot> => {
  for (;;) {
    const job = await getResearchJob(id)
    onProgress(job)
    if (job.status === 'completed') return job
    if (job.status === 'failed') throw new Error(job.error || 'Research job failed.')
    await new Promise((resolve) => setTimeout(resolve, 350))
  }
}

export const downloadResearchReport = (report: unknown, fileName: string) => {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

export const unwrapResearchReport = <T>(value: unknown): T => {
  if (value && typeof value === 'object' && 'report' in value) {
    return (value as { report: T }).report
  }
  return value as T
}
