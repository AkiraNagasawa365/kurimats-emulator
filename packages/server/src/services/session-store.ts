import Database from 'better-sqlite3'
import path from 'path'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import type { BoardLayoutState, CreateFeedbackParams, CreateProjectParams, CreateSessionParams, CreateSshPresetParams, CreateStartupTemplateParams, CreateCmuxWorkspaceParams, DevInstance, Feedback, LayoutState, PaneNode, Project, Session, SlotAssignment, SshPreset, StartupTemplate, CmuxWorkspace } from '@kurimats/shared'
import { v4 as uuidv4 } from 'uuid'
import { loadBoardLayoutState, loadLegacyLayout, saveBoardLayoutState, saveLegacyLayout } from './session-store-layout.js'
import { mapCmuxWorkspaceRow, mapFeedbackRow, mapProjectRow, mapSessionRow, mapSshPresetRow, mapStartupTemplateRow } from './session-store-mappers.js'
import { runSessionStoreMigrations } from './session-store-migrations.js'
import { findFirstLeafId } from '../utils/pane-tree.js'
import { detectPaneNumber } from '@kurimats/shared'

/**
 * PANE_NUMBERに応じたDBパスを算出
 * - 未設定（本番Electron）: sessions.db
 * - 0（develop）: sessions-dev.db
 * - N（paneN）: sessions-paneN.db
 */
function getDefaultDbPath(): string {
  const baseDir = path.join(homedir(), '.kurimats')
  const paneNumber = detectPaneNumber()
  if (paneNumber === null) return path.join(baseDir, 'sessions.db')
  if (paneNumber === 0) return path.join(baseDir, 'sessions-dev.db')
  return path.join(baseDir, `sessions-pane${paneNumber}.db`)
}

const DEFAULT_DB_PATH = getDefaultDbPath()

/**
 * SQLiteベースのセッション永続化
 * @param dbPath DBファイルパス（省略時はPANE_NUMBERに応じたDB、':memory:'でインメモリ）
 */
export class SessionStore {
  private db: Database.Database

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? DEFAULT_DB_PATH

    if (resolvedPath !== ':memory:') {
      const dir = path.dirname(resolvedPath)
      mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(resolvedPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
  }

  private migrate(): void {
    runSessionStoreMigrations(this.db)
  }

  // ==================== セッション ====================

  /**
   * セッション作成
   */
  create(params: Omit<CreateSessionParams, 'sshHost' | 'workspaceId'> & {
    worktreePath?: string | null
    projectId?: string | null
    sshHost?: string | null
    isRemote?: boolean
    workspaceId?: string | null
  }): Session {
    const now = Date.now()
    const session: Session = {
      id: uuidv4(),
      name: params.name,
      repoPath: params.repoPath,
      worktreePath: params.worktreePath ?? null,
      branch: params.baseBranch ?? null,
      status: 'active',
      claudeSessionId: null,
      isFavorite: false,
      projectId: params.projectId ?? null,
      sshHost: params.sshHost ?? null,
      isRemote: params.isRemote ?? false,
      workspaceId: params.workspaceId ?? null,
      createdAt: now,
      lastActiveAt: now,
    }

    this.db.prepare(`
      INSERT INTO sessions (id, name, repo_path, worktree_path, branch, status, claude_session_id, is_favorite, project_id, ssh_host, is_remote, workspace_id, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id, session.name, session.repoPath, session.worktreePath,
      session.branch, session.status, session.claudeSessionId,
      session.isFavorite ? 1 : 0, session.projectId,
      session.sshHost, session.isRemote ? 1 : 0,
      session.workspaceId,
      session.createdAt, session.lastActiveAt
    )

    return session
  }

  /**
   * 全セッション取得
   */
  getAll(): Session[] {
    return (this.db.prepare('SELECT * FROM sessions ORDER BY last_active_at DESC').all() as Record<string, unknown>[]).map(mapSessionRow)
  }

  /**
   * IDでセッション取得
   */
  getById(id: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? mapSessionRow(row) : null
  }

  /**
   * セッション状態更新
   */
  updateStatus(id: string, status: Session['status']): void {
    this.db.prepare('UPDATE sessions SET status = ?, last_active_at = ? WHERE id = ?')
      .run(status, Date.now(), id)
  }

  /**
   * セッションのブランチ更新
   */
  updateBranch(id: string, branch: string | null): void {
    this.db.prepare('UPDATE sessions SET branch = ?, last_active_at = ? WHERE id = ?')
      .run(branch, Date.now(), id)
  }

  /**
   * セッションのworktreeパス更新
   */
  updateWorktreePath(id: string, worktreePath: string | null): void {
    this.db.prepare('UPDATE sessions SET worktree_path = ?, last_active_at = ? WHERE id = ?')
      .run(worktreePath, Date.now(), id)
  }

  /**
   * セッション名変更
   */
  rename(id: string, name: string): void {
    this.db.prepare('UPDATE sessions SET name = ? WHERE id = ?').run(name, id)
  }

  /**
   * セッション削除
   */
  delete(id: string): void {
    const tx = this.db.transaction((sessionId: string) => {
      this.db.prepare('DELETE FROM board_cards WHERE session_id = ?').run(sessionId)
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
    })
    tx(id)
  }

  /**
   * お気に入りトグル
   */
  toggleFavorite(id: string): boolean {
    const session = this.getById(id)
    if (!session) return false
    const newVal = session.isFavorite ? 0 : 1
    this.db.prepare('UPDATE sessions SET is_favorite = ? WHERE id = ?').run(newVal, id)
    return !session.isFavorite
  }

  /**
   * プロジェクト割り当て
   */
  assignProject(sessionId: string, projectId: string | null): void {
    this.db.prepare('UPDATE sessions SET project_id = ? WHERE id = ?').run(projectId, sessionId)
  }

  // ==================== プロジェクト ====================

  /**
   * プロジェクト作成
   */
  createProject(params: CreateProjectParams): Project {
    const project: Project = {
      id: uuidv4(),
      name: params.name,
      color: params.color,
      repoPath: params.repoPath,
      createdAt: Date.now(),
    }

    this.db.prepare(`
      INSERT INTO projects (id, name, color, repo_path, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(project.id, project.name, project.color, project.repoPath, project.createdAt)

    return project
  }

  /**
   * 全プロジェクト取得
   */
  getAllProjects(): Project[] {
    return (this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Record<string, unknown>[])
      .map(mapProjectRow)
  }

  /**
   * IDでプロジェクト取得
   */
  getProjectById(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? mapProjectRow(row) : null
  }

  /**
   * プロジェクト更新
   */
  updateProject(id: string, updates: Partial<CreateProjectParams>): void {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name) }
    if (updates.color !== undefined) { fields.push('color = ?'); values.push(updates.color) }
    if (updates.repoPath !== undefined) { fields.push('repo_path = ?'); values.push(updates.repoPath) }

    if (fields.length === 0) return

    values.push(id)
    this.db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  /**
   * プロジェクト削除
   */
  deleteProject(id: string): void {
    const tx = this.db.transaction((projectId: string) => {
      this.db.prepare('UPDATE sessions SET project_id = NULL WHERE project_id = ?').run(projectId)
      this.db.prepare('DELETE FROM projects WHERE id = ?').run(projectId)
    })
    tx(id)
  }

  // ==================== レイアウト（旧: Phase 8で削除予定） ====================

  saveLayout(state: LayoutState): void {
    saveLegacyLayout(this.db, state)
  }

  /**
   * レイアウト取得
   */
  getLayout(): LayoutState | null {
    return loadLegacyLayout(this.db)
  }

  // ==================== ボードレイアウト ====================

  /**
   * ボードレイアウト保存
   */
  saveBoardLayout(state: BoardLayoutState): void {
    saveBoardLayoutState(this.db, state)
  }

  /**
   * ボードレイアウト取得
   */
  getBoardLayout(): BoardLayoutState | null {
    return loadBoardLayoutState(this.db)
  }

  // ==================== フィードバック ====================

  /**
   * フィードバック作成
   */
  createFeedback(params: CreateFeedbackParams): Feedback {
    const feedback: Feedback = {
      id: uuidv4(),
      title: params.title,
      detail: params.detail,
      category: params.category,
      priority: params.priority,
      createdAt: Date.now(),
    }

    this.db.prepare(`
      INSERT INTO feedback (id, title, detail, category, priority, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(feedback.id, feedback.title, feedback.detail, feedback.category, feedback.priority, feedback.createdAt)

    return feedback
  }

  /**
   * 全フィードバック取得
   */
  getAllFeedback(): Feedback[] {
    return (this.db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all() as Record<string, unknown>[])
      .map(mapFeedbackRow)
  }

  /**
   * フィードバック削除
   */
  deleteFeedback(id: string): boolean {
    const result = this.db.prepare('DELETE FROM feedback WHERE id = ?').run(id)
    return result.changes > 0
  }

  // ==================== SSHプリセット ====================

  /** SSHプリセット作成 */
  createSshPreset(params: CreateSshPresetParams): SshPreset {
    const preset: SshPreset = {
      id: uuidv4(),
      name: params.name,
      hostname: params.hostname,
      user: params.user,
      port: params.port ?? 22,
      identityFile: params.identityFile ?? null,
      defaultCwd: params.defaultCwd,
      startupCommand: params.startupCommand ?? null,
      envVars: params.envVars ?? {},
      createdAt: Date.now(),
    }
    this.db.prepare(`
      INSERT INTO ssh_presets (id, name, hostname, user, port, identity_file, default_cwd, startup_command, env_vars, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(preset.id, preset.name, preset.hostname, preset.user, preset.port, preset.identityFile, preset.defaultCwd, preset.startupCommand, JSON.stringify(preset.envVars), preset.createdAt)
    return preset
  }

  /** 全SSHプリセット取得 */
  getAllSshPresets(): SshPreset[] {
    return (this.db.prepare('SELECT * FROM ssh_presets ORDER BY created_at DESC').all() as Record<string, unknown>[])
      .map(mapSshPresetRow)
  }

  /** SSHプリセット取得 */
  getSshPreset(id: string): SshPreset | null {
    const row = this.db.prepare('SELECT * FROM ssh_presets WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? mapSshPresetRow(row) : null
  }

  /** SSHプリセット更新 */
  updateSshPreset(id: string, updates: Partial<CreateSshPresetParams>): SshPreset | null {
    const existing = this.getSshPreset(id)
    if (!existing) return null
    // undefinedのフィールドは既存値を維持（スプレッドのundefined上書き防止）
    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    )
    const updated = { ...existing, ...filtered }
    if (updates.envVars) updated.envVars = updates.envVars
    this.db.prepare(`
      UPDATE ssh_presets SET name=?, hostname=?, user=?, port=?, identity_file=?, default_cwd=?, startup_command=?, env_vars=?
      WHERE id=?
    `).run(updated.name, updated.hostname, updated.user, updated.port, updated.identityFile, updated.defaultCwd, updated.startupCommand, JSON.stringify(updated.envVars), id)
    return this.getSshPreset(id)
  }

  /** SSHプリセット削除 */
  deleteSshPreset(id: string): boolean {
    return this.db.prepare('DELETE FROM ssh_presets WHERE id = ?').run(id).changes > 0
  }

  // ==================== 起動テンプレート ====================

  /** 起動テンプレート作成 */
  createStartupTemplate(params: CreateStartupTemplateParams): StartupTemplate {
    const template: StartupTemplate = {
      id: uuidv4(),
      name: params.name,
      sshPresetId: params.sshPresetId ?? null,
      commands: params.commands,
      envVars: params.envVars ?? {},
      createdAt: Date.now(),
    }
    this.db.prepare(`
      INSERT INTO startup_templates (id, name, ssh_preset_id, commands, env_vars, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(template.id, template.name, template.sshPresetId, JSON.stringify(template.commands), JSON.stringify(template.envVars), template.createdAt)
    return template
  }

  /** 全起動テンプレート取得 */
  getAllStartupTemplates(): StartupTemplate[] {
    return (this.db.prepare('SELECT * FROM startup_templates ORDER BY created_at DESC').all() as Record<string, unknown>[])
      .map(mapStartupTemplateRow)
  }

  /** 起動テンプレート取得 */
  getStartupTemplate(id: string): StartupTemplate | null {
    const row = this.db.prepare('SELECT * FROM startup_templates WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? mapStartupTemplateRow(row) : null
  }

  /** 起動テンプレート削除 */
  deleteStartupTemplate(id: string): boolean {
    return this.db.prepare('DELETE FROM startup_templates WHERE id = ?').run(id).changes > 0
  }

  // ==================== プロジェクトSSH紐付け ====================

  /** プロジェクトにSSHプリセットを紐付け */
  setProjectSshPreset(projectId: string, sshPresetId: string | null): void {
    this.db.prepare('UPDATE projects SET ssh_preset_id = ? WHERE id = ?').run(sshPresetId, projectId)
  }

  /** プロジェクトに起動テンプレートを紐付け */
  setProjectStartupTemplate(projectId: string, startupTemplateId: string | null): void {
    this.db.prepare('UPDATE projects SET startup_template_id = ? WHERE id = ?').run(startupTemplateId, projectId)
  }

  // ==================== cmuxワークスペース ====================

  /** ワークスペース作成 */
  createCmuxWorkspace(params: CreateCmuxWorkspaceParams, initialPaneTree: PaneNode, id = uuidv4()): CmuxWorkspace {
    const now = Date.now()
    const activePaneId = findFirstLeafId(initialPaneTree)

    const workspace: CmuxWorkspace = {
      id,
      name: params.name ?? (path.basename(params.repoPath) || 'workspace'),
      projectId: params.projectId ?? null,
      repoPath: params.repoPath,
      sshHost: params.sshHost ?? null,
      paneTree: initialPaneTree,
      activePaneId,
      isPinned: false,
      notificationCount: 0,
      lastNotifiedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    this.db.prepare(`
      INSERT INTO cmux_workspaces (id, name, project_id, repo_path, ssh_host, pane_tree, active_pane_id, is_pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspace.name, workspace.projectId, workspace.repoPath, workspace.sshHost, JSON.stringify(initialPaneTree), activePaneId, 0, now, now)

    return workspace
  }

  /** セッションのworkspace_idを更新 */
  assignWorkspace(sessionId: string, workspaceId: string): void {
    this.db.prepare('UPDATE sessions SET workspace_id = ? WHERE id = ?').run(workspaceId, sessionId)
  }

  /** 全ワークスペース取得 */
  getAllCmuxWorkspaces(): CmuxWorkspace[] {
    return (this.db.prepare('SELECT * FROM cmux_workspaces ORDER BY created_at DESC').all() as Record<string, unknown>[])
      .map(mapCmuxWorkspaceRow)
  }

  /** ワークスペース取得 */
  getCmuxWorkspace(id: string): CmuxWorkspace | null {
    const row = this.db.prepare('SELECT * FROM cmux_workspaces WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? mapCmuxWorkspaceRow(row) : null
  }

  /** ワークスペース名変更 */
  renameCmuxWorkspace(id: string, name: string): CmuxWorkspace | null {
    this.db.prepare('UPDATE cmux_workspaces SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id)
    return this.getCmuxWorkspace(id)
  }

  /** ピン留めトグル */
  toggleCmuxWorkspacePin(id: string): CmuxWorkspace | null {
    const ws = this.getCmuxWorkspace(id)
    if (!ws) return null
    const newPinned = ws.isPinned ? 0 : 1
    this.db.prepare('UPDATE cmux_workspaces SET is_pinned = ?, updated_at = ? WHERE id = ?').run(newPinned, Date.now(), id)
    return this.getCmuxWorkspace(id)
  }

  /** ペインツリー更新 */
  updateCmuxPaneTree(id: string, paneTree: PaneNode, activePaneId: string): void {
    this.db.prepare('UPDATE cmux_workspaces SET pane_tree = ?, active_pane_id = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(paneTree), activePaneId, Date.now(), id)
  }

  /** ワークスペース削除 */
  deleteCmuxWorkspace(id: string): boolean {
    const tx = this.db.transaction((workspaceId: string) => {
      this.db.prepare('UPDATE sessions SET workspace_id = NULL WHERE workspace_id = ?').run(workspaceId)
      return this.db.prepare('DELETE FROM cmux_workspaces WHERE id = ?').run(workspaceId).changes > 0
    })
    return tx(id)
  }

  // ========== DevInstance / SlotAssignment ==========

  /** DevInstance を作成 */
  createDevInstance(params: {
    slotNumber: number
    serverPort: number
    clientPort: number
    playwrightPort: number
  }): DevInstance {
    const id = uuidv4()
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO dev_instances (id, slot_number, server_port, client_port, playwright_port, status, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?, 'idle', ?, ?)
    `).run(id, params.slotNumber, params.serverPort, params.clientPort, params.playwrightPort, now, now)
    return this.getDevInstance(params.slotNumber)!
  }

  /** スロット番号で DevInstance を取得 */
  getDevInstance(slotNumber: number): DevInstance | null {
    const row = this.db.prepare('SELECT * FROM dev_instances WHERE slot_number = ?').get(slotNumber) as any
    return row ? mapDevInstanceRow(row) : null
  }

  /** ID で DevInstance を取得 */
  getDevInstanceById(id: string): DevInstance | null {
    const row = this.db.prepare('SELECT * FROM dev_instances WHERE id = ?').get(id) as any
    return row ? mapDevInstanceRow(row) : null
  }

  /** 全 DevInstance を取得 */
  getAllDevInstances(): DevInstance[] {
    const rows = this.db.prepare('SELECT * FROM dev_instances ORDER BY slot_number').all() as any[]
    return rows.map(mapDevInstanceRow)
  }

  /** DevInstance の状態を更新 */
  updateDevInstanceStatus(id: string, status: string, pid?: number | null): void {
    const now = Date.now()
    if (pid !== undefined) {
      this.db.prepare('UPDATE dev_instances SET status = ?, pid = ?, last_active_at = ? WHERE id = ?').run(status, pid, now, id)
    } else {
      this.db.prepare('UPDATE dev_instances SET status = ?, last_active_at = ? WHERE id = ?').run(status, now, id)
    }
  }

  /** DevInstance の worktreePath を更新 */
  updateDevInstanceWorktreePath(id: string, worktreePath: string | null): void {
    this.db.prepare('UPDATE dev_instances SET worktree_path = ? WHERE id = ?').run(worktreePath, id)
  }

  /** DevInstance のセッションバインディングを更新 */
  updateDevInstanceSession(id: string, sessionId: string | null): void {
    this.db.prepare('UPDATE dev_instances SET assigned_session_id = ? WHERE id = ?').run(sessionId, id)
  }

  /** DevInstance を削除 */
  deleteDevInstance(id: string): boolean {
    const tx = this.db.transaction((instanceId: string) => {
      this.db.prepare('DELETE FROM slot_assignments WHERE instance_id = ?').run(instanceId)
      return this.db.prepare('DELETE FROM dev_instances WHERE id = ?').run(instanceId).changes > 0
    })
    return tx(id)
  }

  /**
   * スロットを割り当て（UNIQUE 制約で排他制御）
   * @throws slot_number が既に使用中の場合は UNIQUE constraint エラー
   */
  assignSlot(slotNumber: number, instanceId: string): SlotAssignment {
    const now = Date.now()
    this.db.prepare(`
      INSERT INTO slot_assignments (slot_number, instance_id, assigned_at)
      VALUES (?, ?, ?)
    `).run(slotNumber, instanceId, now)
    return { slotNumber, instanceId, assignedAt: now }
  }

  /** スロットを解放 */
  releaseSlot(slotNumber: number): void {
    this.db.prepare('DELETE FROM slot_assignments WHERE slot_number = ?').run(slotNumber)
  }

  /** スロット割り当てを取得 */
  getSlotAssignment(slotNumber: number): SlotAssignment | null {
    const row = this.db.prepare('SELECT * FROM slot_assignments WHERE slot_number = ?').get(slotNumber) as any
    return row ? { slotNumber: row.slot_number, instanceId: row.instance_id, assignedAt: row.assigned_at } : null
  }

  /** 全スロット割り当てを取得 */
  getAllSlotAssignments(): SlotAssignment[] {
    const rows = this.db.prepare('SELECT * FROM slot_assignments ORDER BY slot_number').all() as any[]
    return rows.map(row => ({ slotNumber: row.slot_number, instanceId: row.instance_id, assignedAt: row.assigned_at }))
  }

  close(): void {
    this.db.close()
  }
}

/** DB行を DevInstance にマップ */
function mapDevInstanceRow(row: any): DevInstance {
  return {
    id: row.id,
    slotNumber: row.slot_number,
    serverPort: row.server_port,
    clientPort: row.client_port,
    playwrightPort: row.playwright_port,
    status: row.status,
    pid: row.pid ?? null,
    worktreePath: row.worktree_path ?? null,
    assignedSessionId: row.assigned_session_id ?? null,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  }
}
