import type { Session, CreateSessionParams, FileNode, Project, CreateProjectParams, LayoutState, BoardLayoutState, TabListResponse, TabSyncResponse, TabBookmark, SshHost, SshConnectionStatus, Feedback, CreateFeedbackParams } from '@kurimats/shared'

const BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(error.error || res.statusText)
  }
  return res.json()
}

// セッションAPI
export const sessionsApi = {
  list: () => request<Session[]>('/sessions'),
  get: (id: string) => request<Session>(`/sessions/${id}`),
  create: (params: CreateSessionParams) =>
    request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/sessions/${id}`, { method: 'DELETE' }),
  toggleFavorite: (id: string) =>
    request<{ isFavorite: boolean }>(`/sessions/${id}/favorite`, { method: 'POST' }),
  assignProject: (id: string, projectId: string | null) =>
    request<{ ok: boolean }>(`/sessions/${id}/project`, {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    }),
  getPreview: (id: string, lines = 5) =>
    request<{ sessionId: string; lines: string[] }>(`/sessions/${id}/preview?lines=${lines}`),
}

// ファイルAPI
export const filesApi = {
  tree: (root: string) => request<FileNode[]>(`/files/tree?root=${encodeURIComponent(root)}`),
  content: (path: string) => request<{ content: string; path: string }>(`/files/content?path=${encodeURIComponent(path)}`),
  save: (path: string, content: string) =>
    request<{ ok: boolean }>('/files/content', {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    }),
}

// プロジェクトAPI
export const projectsApi = {
  list: () => request<Project[]>('/projects'),
  create: (params: CreateProjectParams) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(params) }),
  update: (id: string, updates: Partial<CreateProjectParams>) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
}

// レイアウトAPI
export const layoutApi = {
  get: () => request<LayoutState | null>('/layout'),
  save: (state: LayoutState) =>
    request<{ ok: boolean }>('/layout', { method: 'PUT', body: JSON.stringify(state) }),
  getBoard: () => request<BoardLayoutState | null>('/layout/board'),
  saveBoard: (state: BoardLayoutState) =>
    request<{ ok: boolean }>('/layout/board', { method: 'PUT', body: JSON.stringify(state) }),
}

// tabコマンドAPI
export const tabApi = {
  list: () => request<TabListResponse>('/tab/list'),
  sync: () => request<TabSyncResponse>('/tab/sync', { method: 'POST' }),
  bookmarks: () => request<{ bookmarks: TabBookmark[] }>('/tab/bookmarks'),
}

// フィードバックAPI
export const feedbackApi = {
  list: () => request<Feedback[]>('/feedback'),
  create: (params: CreateFeedbackParams) =>
    request<Feedback>('/feedback', {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/feedback/${id}`, { method: 'DELETE' }),
}

// SSH API
export const sshApi = {
  hosts: () => request<SshHost[]>('/ssh/hosts'),
  connect: (host: string) =>
    request<{ ok: boolean; status: string }>('/ssh/connect', {
      method: 'POST',
      body: JSON.stringify({ host }),
    }),
  disconnect: (host: string) =>
    request<{ ok: boolean; status: string }>(`/ssh/disconnect/${encodeURIComponent(host)}`, {
      method: 'DELETE',
    }),
  status: () => request<Record<string, SshConnectionStatus>>('/ssh/status'),
  refresh: () => request<SshHost[]>('/ssh/refresh', { method: 'POST' }),
}
