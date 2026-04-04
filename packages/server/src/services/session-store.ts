import Database from 'better-sqlite3'
import path from 'path'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import type { Session, CreateSessionParams, Project, CreateProjectParams, Feedback, CreateFeedbackParams, SshPreset, CreateSshPresetParams, StartupTemplate, CreateStartupTemplateParams, CmuxWorkspace, CreateCmuxWorkspaceParams, PaneNode } from '@kurimats/shared'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'data', 'sessions.db')

/**
 * SQLiteベースのセッション永続化
 * @param dbPath DBファイルパス（省略時はdata/sessions.db、':memory:'でインメモリ）
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
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        worktree_path TEXT,
        branch TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        claude_session_id TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        project_id TEXT,
        created_at INTEGER NOT NULL,
        last_active_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS board_cards (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '{}',
        position_x REAL NOT NULL DEFAULT 0,
        position_y REAL NOT NULL DEFAULT 0,
        width REAL NOT NULL DEFAULT 300,
        height REAL NOT NULL DEFAULT 200,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#3b82f6',
        repo_path TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS layout_state (
        id TEXT PRIMARY KEY DEFAULT 'default',
        mode TEXT NOT NULL DEFAULT '1x1',
        panels TEXT NOT NULL DEFAULT '[]',
        active_panel_index INTEGER NOT NULL DEFAULT 0,
        saved_at INTEGER NOT NULL
      );
    `)

    // ボードレイアウト永続化テーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS board_layout (
        id TEXT PRIMARY KEY DEFAULT 'default',
        nodes TEXT NOT NULL DEFAULT '[]',
        edges TEXT NOT NULL DEFAULT '[]',
        viewport_x REAL NOT NULL DEFAULT 0,
        viewport_y REAL NOT NULL DEFAULT 0,
        viewport_zoom REAL NOT NULL DEFAULT 1,
        saved_at INTEGER NOT NULL DEFAULT 0
      );
    `)

    // edgesカラム追加（既存DBの場合）
    try { this.db.exec("ALTER TABLE board_layout ADD COLUMN edges TEXT NOT NULL DEFAULT '[]'") } catch { /* カラム既存 */ }

    // 既存テーブルへのカラム追加（既にあればスキップ）
    try { this.db.exec('ALTER TABLE sessions ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0') } catch { /* カラム既存 */ }
    try { this.db.exec('ALTER TABLE sessions ADD COLUMN project_id TEXT') } catch { /* カラム既存 */ }
    try { this.db.exec('ALTER TABLE sessions ADD COLUMN ssh_host TEXT') } catch { /* カラム既存 */ }
    try { this.db.exec('ALTER TABLE sessions ADD COLUMN is_remote INTEGER NOT NULL DEFAULT 0') } catch { /* カラム既存 */ }

    // フィードバックテーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'feature_request',
        priority TEXT NOT NULL DEFAULT 'medium',
        created_at INTEGER NOT NULL
      );
    `)

    // SSHホストテーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ssh_hosts (
        name TEXT PRIMARY KEY,
        hostname TEXT NOT NULL,
        user TEXT NOT NULL DEFAULT 'root',
        port INTEGER NOT NULL DEFAULT 22,
        identity_file TEXT,
        last_connected INTEGER
      );
    `)

    // SSHプリセットテーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ssh_presets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        hostname TEXT NOT NULL,
        user TEXT NOT NULL DEFAULT 'root',
        port INTEGER NOT NULL DEFAULT 22,
        identity_file TEXT,
        default_cwd TEXT NOT NULL DEFAULT '~',
        startup_command TEXT,
        env_vars TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
    `)

    // 起動テンプレートテーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS startup_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ssh_preset_id TEXT,
        commands TEXT NOT NULL DEFAULT '[]',
        env_vars TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
    `)

    // プロジェクトにSSHプリセット・起動テンプレート紐付け
    try { this.db.exec('ALTER TABLE projects ADD COLUMN ssh_preset_id TEXT') } catch { /* カラム既存 */ }
    try { this.db.exec('ALTER TABLE projects ADD COLUMN startup_template_id TEXT') } catch { /* カラム既存 */ }

    // cmuxワークスペーステーブル（v3）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cmux_workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        project_id TEXT,
        repo_path TEXT NOT NULL DEFAULT '',
        ssh_host TEXT,
        pane_tree TEXT NOT NULL DEFAULT '{}',
        active_pane_id TEXT,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)

    // 既存テーブルへのカラム追加（v3.1移行用）
    try { this.db.exec('ALTER TABLE cmux_workspaces ADD COLUMN repo_path TEXT NOT NULL DEFAULT \'\'') } catch { /* カラム既存 */ }
    try { this.db.exec('ALTER TABLE cmux_workspaces ADD COLUMN ssh_host TEXT') } catch { /* カラム既存 */ }

    // セッションにworkspace_id追加
    try { this.db.exec('ALTER TABLE sessions ADD COLUMN workspace_id TEXT') } catch { /* カラム既存 */ }
  }

  // ==================== セッション ====================

  /**
   * セッション作成
   */
  create(params: Omit<CreateSessionParams, 'sshHost'> & {
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
    return (this.db.prepare('SELECT * FROM sessions ORDER BY last_active_at DESC').all() as Record<string, unknown>[]).map(this.mapRow)
  }

  /**
   * IDでセッション取得
   */
  getById(id: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? this.mapRow(row) : null
  }

  /**
   * セッション状態更新
   */
  updateStatus(id: string, status: Session['status']): void {
    this.db.prepare('UPDATE sessions SET status = ?, last_active_at = ? WHERE id = ?')
      .run(status, Date.now(), id)
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
    this.db.prepare('DELETE FROM board_cards WHERE session_id = ?').run(id)
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
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
      .map(this.mapProjectRow)
  }

  /**
   * IDでプロジェクト取得
   */
  getProjectById(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? this.mapProjectRow(row) : null
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
    // 関連セッションのproject_idをnullに
    this.db.prepare('UPDATE sessions SET project_id = NULL WHERE project_id = ?').run(id)
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  // ==================== レイアウト（旧: Phase 8で削除予定） ====================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveLayout(state: any): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO layout_state (id, mode, panels, active_panel_index, saved_at)
      VALUES ('default', ?, ?, ?, ?)
    `).run(state.mode, JSON.stringify(state.panels), state.activePanelIndex, state.savedAt)
  }

  /**
   * レイアウト取得
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getLayout(): any {
    const row = this.db.prepare('SELECT * FROM layout_state WHERE id = ?').get('default') as Record<string, unknown> | undefined
    if (!row) return null
    return {
      mode: row.mode as string,
      panels: JSON.parse(row.panels as string),
      activePanelIndex: row.active_panel_index as number,
      savedAt: row.saved_at as number,
    }
  }

  // ==================== ボードレイアウト ====================

  /**
   * ボードレイアウト保存
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveBoardLayout(state: any): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO board_layout (id, nodes, edges, viewport_x, viewport_y, viewport_zoom, saved_at)
      VALUES ('default', ?, ?, ?, ?, ?, ?)
    `).run(
      JSON.stringify(state.nodes),
      JSON.stringify(state.edges || []),
      state.viewport.x,
      state.viewport.y,
      state.viewport.zoom,
      state.savedAt,
    )
  }

  /**
   * ボードレイアウト取得
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getBoardLayout(): any {
    const row = this.db.prepare('SELECT * FROM board_layout WHERE id = ?').get('default') as Record<string, unknown> | undefined
    if (!row) return null
    return {
      nodes: JSON.parse(row.nodes as string),
      edges: JSON.parse((row.edges as string) || '[]'),
      viewport: {
        x: row.viewport_x as number,
        y: row.viewport_y as number,
        zoom: row.viewport_zoom as number,
      },
      savedAt: row.saved_at as number,
    }
  }

  // ==================== マッピング ====================

  /**
   * DBの行をSession型にマッピング
   */
  private mapRow(row: Record<string, unknown>): Session {
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

  /**
   * DBの行をProject型にマッピング
   */
  private mapProjectRow(row: Record<string, unknown>): Project {
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
      .map(this.mapFeedbackRow)
  }

  /**
   * フィードバック削除
   */
  deleteFeedback(id: string): boolean {
    const result = this.db.prepare('DELETE FROM feedback WHERE id = ?').run(id)
    return result.changes > 0
  }

  /**
   * DBの行をFeedback型にマッピング
   */
  private mapFeedbackRow(row: Record<string, unknown>): Feedback {
    return {
      id: row.id as string,
      title: row.title as string,
      detail: row.detail as string,
      category: row.category as Feedback['category'],
      priority: row.priority as Feedback['priority'],
      createdAt: row.created_at as number,
    }
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
      .map(this.mapSshPresetRow)
  }

  /** SSHプリセット取得 */
  getSshPreset(id: string): SshPreset | null {
    const row = this.db.prepare('SELECT * FROM ssh_presets WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? this.mapSshPresetRow(row) : null
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

  private mapSshPresetRow(row: Record<string, unknown>): SshPreset {
    return {
      id: row.id as string,
      name: row.name as string,
      hostname: row.hostname as string,
      user: row.user as string,
      port: row.port as number,
      identityFile: row.identity_file as string | null,
      defaultCwd: row.default_cwd as string,
      startupCommand: row.startup_command as string | null,
      envVars: JSON.parse((row.env_vars as string) || '{}'),
      createdAt: row.created_at as number,
    }
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
      .map(this.mapStartupTemplateRow)
  }

  /** 起動テンプレート取得 */
  getStartupTemplate(id: string): StartupTemplate | null {
    const row = this.db.prepare('SELECT * FROM startup_templates WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? this.mapStartupTemplateRow(row) : null
  }

  /** 起動テンプレート削除 */
  deleteStartupTemplate(id: string): boolean {
    return this.db.prepare('DELETE FROM startup_templates WHERE id = ?').run(id).changes > 0
  }

  private mapStartupTemplateRow(row: Record<string, unknown>): StartupTemplate {
    return {
      id: row.id as string,
      name: row.name as string,
      sshPresetId: row.ssh_preset_id as string | null,
      commands: JSON.parse((row.commands as string) || '[]'),
      envVars: JSON.parse((row.env_vars as string) || '{}'),
      createdAt: row.created_at as number,
    }
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
  createCmuxWorkspace(params: CreateCmuxWorkspaceParams, initialPaneTree: PaneNode): CmuxWorkspace {
    const now = Date.now()
    const id = uuidv4()
    const activePaneId = this.findFirstLeafId(initialPaneTree)

    const workspace: CmuxWorkspace = {
      id,
      name: params.name,
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
      .map(this.mapCmuxWorkspaceRow)
  }

  /** ワークスペース取得 */
  getCmuxWorkspace(id: string): CmuxWorkspace | null {
    const row = this.db.prepare('SELECT * FROM cmux_workspaces WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row ? this.mapCmuxWorkspaceRow(row) : null
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
    // 関連セッションのworkspace_idをnullに
    this.db.prepare('UPDATE sessions SET workspace_id = NULL WHERE workspace_id = ?').run(id)
    return this.db.prepare('DELETE FROM cmux_workspaces WHERE id = ?').run(id).changes > 0
  }

  private mapCmuxWorkspaceRow(row: Record<string, unknown>): CmuxWorkspace {
    return {
      id: row.id as string,
      name: row.name as string,
      projectId: (row.project_id as string | null) ?? null,
      repoPath: (row.repo_path as string) ?? '',
      sshHost: (row.ssh_host as string | null) ?? null,
      paneTree: JSON.parse((row.pane_tree as string) || '{}'),
      activePaneId: (row.active_pane_id as string) ?? '',
      isPinned: Boolean(row.is_pinned),
      notificationCount: 0, // ランタイムのみ
      lastNotifiedAt: null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    }
  }

  /** ペインツリーの最初のリーフIDを取得 */
  private findFirstLeafId(node: PaneNode): string {
    if (node.kind === 'leaf') return node.id
    return this.findFirstLeafId(node.children[0])
  }

  close(): void {
    this.db.close()
  }
}
