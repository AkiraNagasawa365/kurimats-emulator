import type {
  CmuxWorkspace,
  Feedback,
  PaneNode,
  Project,
  Session,
  SshPreset,
  StartupTemplate,
} from '@kurimats/shared'

export function mapSessionRow(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    name: row.name as string,
    repoPath: row.repo_path as string,
    worktreePath: row.worktree_path as string | null,
    branch: row.branch as string | null,
    status: row.status as Session['status'],
    claudeSessionId: row.claude_session_id as string | null,
    isFavorite: Boolean(row.is_favorite),
    projectId: row.project_id as string | null,
    sshHost: (row.ssh_host as string | null) ?? null,
    isRemote: Boolean(row.is_remote),
    workspaceId: (row.workspace_id as string | null) ?? null,
    createdAt: row.created_at as number,
    lastActiveAt: row.last_active_at as number,
  }
}

export function mapProjectRow(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    color: row.color as string,
    repoPath: row.repo_path as string,
    sshPresetId: (row.ssh_preset_id as string | null) ?? null,
    startupTemplateId: (row.startup_template_id as string | null) ?? null,
    createdAt: row.created_at as number,
  }
}

export function mapFeedbackRow(row: Record<string, unknown>): Feedback {
  return {
    id: row.id as string,
    title: row.title as string,
    detail: row.detail as string,
    category: row.category as Feedback['category'],
    priority: row.priority as Feedback['priority'],
    createdAt: row.created_at as number,
  }
}

export function mapSshPresetRow(row: Record<string, unknown>): SshPreset {
  return {
    id: row.id as string,
    name: row.name as string,
    hostname: row.hostname as string,
    user: row.user as string,
    port: row.port as number,
    identityFile: row.identity_file as string | null,
    defaultCwd: row.default_cwd as string,
    startupCommand: row.startup_command as string | null,
    envVars: JSON.parse((row.env_vars as string) || '{}') as Record<string, string>,
    createdAt: row.created_at as number,
  }
}

export function mapStartupTemplateRow(row: Record<string, unknown>): StartupTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    sshPresetId: row.ssh_preset_id as string | null,
    commands: JSON.parse((row.commands as string) || '[]') as string[],
    envVars: JSON.parse((row.env_vars as string) || '{}') as Record<string, string>,
    createdAt: row.created_at as number,
  }
}

export function mapCmuxWorkspaceRow(row: Record<string, unknown>): CmuxWorkspace {
  return {
    id: row.id as string,
    name: row.name as string,
    projectId: (row.project_id as string | null) ?? null,
    repoPath: (row.repo_path as string) ?? '',
    sshHost: (row.ssh_host as string | null) ?? null,
    paneTree: JSON.parse((row.pane_tree as string) || '{}') as PaneNode,
    activePaneId: (row.active_pane_id as string) ?? '',
    isPinned: Boolean(row.is_pinned),
    notificationCount: 0,
    lastNotifiedAt: null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }
}
