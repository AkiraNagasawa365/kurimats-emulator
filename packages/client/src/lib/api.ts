import type { Session, CreateSessionParams, FileNode, Project, CreateProjectParams, TabListResponse, TabSyncResponse, TabBookmark, SshHost, SshConnectionStatus, Feedback, CreateFeedbackParams, SshPreset, CreateSshPresetParams, StartupTemplate, CreateStartupTemplateParams, CmuxWorkspace, CreateCmuxWorkspaceParams, PaneNode, SplitPaneRequest, SplitPaneResponse, ClosePaneRequest, ClosePaneResponse, LayoutState, BoardLayoutState, ResourceSnapshot, ResourceMetrics } from '@kurimats/shared'

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
  reconnect: (id: string) =>
    request<{ ok: boolean; session: Session }>(`/sessions/${id}/reconnect`, { method: 'POST' }),
  rename: (id: string, name: string) =>
    request<{ ok: boolean; session: Session }>(`/sessions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
}

// ファイルAPI（sshHostがある場合はリモートSFTP経由）
export const filesApi = {
  tree: (root: string, sshHost?: string | null) => {
    const params = new URLSearchParams({ root })
    if (sshHost) params.set('sshHost', sshHost)
    return request<FileNode[]>(`/files/tree?${params}`)
  },
  content: (path: string, sshHost?: string | null) => {
    const params = new URLSearchParams({ path })
    if (sshHost) params.set('sshHost', sshHost)
    return request<{ content: string; path: string }>(`/files/content?${params}`)
  },
  save: (path: string, content: string, sshHost?: string | null) =>
    request<{ ok: boolean }>('/files/content', {
      method: 'PUT',
      body: JSON.stringify({ path, content, ...(sshHost ? { sshHost } : {}) }),
    }),
}

// プロジェクトAPI
export const projectsApi = {
  list: () => request<Project[]>('/projects'),
  create: (params: CreateProjectParams) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(params) }),
  update: (id: string, updates: Partial<CreateProjectParams> & { sshPresetId?: string | null; startupTemplateId?: string | null }) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
}

// ワークスペースAPI（cmux v3）
export const workspacesApi = {
  list: () => request<CmuxWorkspace[]>('/workspaces'),
  get: (id: string) => request<CmuxWorkspace>(`/workspaces/${id}`),
  create: (params: CreateCmuxWorkspaceParams) =>
    request<CmuxWorkspace>('/workspaces', { method: 'POST', body: JSON.stringify(params) }),
  delete: (id: string) =>
    request<{ ok: boolean }>(`/workspaces/${id}`, { method: 'DELETE' }),
  rename: (id: string, name: string) =>
    request<CmuxWorkspace>(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  togglePin: (id: string) =>
    request<CmuxWorkspace>(`/workspaces/${id}/pin`, { method: 'POST' }),
  updatePaneTree: (id: string, paneTree: PaneNode, activePaneId: string) =>
    request<{ ok: boolean }>(`/workspaces/${id}/pane-tree`, {
      method: 'PUT',
      body: JSON.stringify({ paneTree, activePaneId }),
    }),
  splitPane: (id: string, params: SplitPaneRequest) =>
    request<SplitPaneResponse>(`/workspaces/${id}/split-pane`, {
      method: 'POST',
      body: JSON.stringify(params),
    }),
  closePane: (id: string, params: ClosePaneRequest) =>
    request<ClosePaneResponse>(`/workspaces/${id}/close-pane`, {
      method: 'POST',
      body: JSON.stringify(params),
    }),
}

// 旧レイアウトAPI
export const layoutApi = {
  get: () => request<LayoutState | null>('/layout'),
  save: (state: LayoutState) =>
    request<{ ok: boolean }>('/layout', {
      method: 'PUT',
      body: JSON.stringify(state),
    }),
  getBoard: () => request<BoardLayoutState | null>('/layout/board'),
  saveBoard: (state: BoardLayoutState) =>
    request<{ ok: boolean }>('/layout/board', {
      method: 'PUT',
      body: JSON.stringify(state),
    }),
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

  // SSHプリセット
  presets: {
    list: () => request<SshPreset[]>('/ssh/presets'),
    create: (params: CreateSshPresetParams) =>
      request<SshPreset>('/ssh/presets', { method: 'POST', body: JSON.stringify(params) }),
    update: (id: string, params: Partial<CreateSshPresetParams>) =>
      request<SshPreset>(`/ssh/presets/${id}`, { method: 'PATCH', body: JSON.stringify(params) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/ssh/presets/${id}`, { method: 'DELETE' }),
  },

  // 起動テンプレート
  templates: {
    list: () => request<StartupTemplate[]>('/ssh/templates'),
    create: (params: CreateStartupTemplateParams) =>
      request<StartupTemplate>('/ssh/templates', { method: 'POST', body: JSON.stringify(params) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/ssh/templates/${id}`, { method: 'DELETE' }),
  },
}

// リソース監視API
export const resourcesApi = {
  snapshot: () => request<ResourceSnapshot>('/resources'),
  instance: (id: string) => request<ResourceMetrics>(`/resources/${id}`),
  collect: () => request<ResourceSnapshot>('/resources/collect', { method: 'POST' }),
}
