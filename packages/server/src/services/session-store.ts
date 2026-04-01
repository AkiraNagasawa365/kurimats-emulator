import Database from 'better-sqlite3'
import path from 'path'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import type { Session, CreateSessionParams, Project, CreateProjectParams, LayoutState } from '@kurimats/shared'
import { v4 as uuidv4 } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'sessions.db')

/**
 * SQLiteベースのセッション永続化
 */
export class SessionStore {
  private db: Database.Database

  constructor() {
    // dataディレクトリを確保
    const dir = path.dirname(DB_PATH)
    mkdirSync(dir, { recursive: true })

    this.db = new Database(DB_PATH)
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

    // 既存テーブルへのカラム追加（既にあればスキップ）
    try { this.db.exec('ALTER TABLE sessions ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0') } catch { /* カラム既存 */ }
    try { this.db.exec('ALTER TABLE sessions ADD COLUMN project_id TEXT') } catch { /* カラム既存 */ }
  }

  // ==================== セッション ====================

  /**
   * セッション作成
   */
  create(params: CreateSessionParams & { worktreePath?: string | null; projectId?: string | null }): Session {
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
      createdAt: now,
      lastActiveAt: now,
    }

    this.db.prepare(`
      INSERT INTO sessions (id, name, repo_path, worktree_path, branch, status, claude_session_id, is_favorite, project_id, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id, session.name, session.repoPath, session.worktreePath,
      session.branch, session.status, session.claudeSessionId,
      session.isFavorite ? 1 : 0, session.projectId,
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

  // ==================== レイアウト ====================

  /**
   * レイアウト保存
   */
  saveLayout(state: LayoutState): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO layout_state (id, mode, panels, active_panel_index, saved_at)
      VALUES ('default', ?, ?, ?, ?)
    `).run(state.mode, JSON.stringify(state.panels), state.activePanelIndex, state.savedAt)
  }

  /**
   * レイアウト取得
   */
  getLayout(): LayoutState | null {
    const row = this.db.prepare('SELECT * FROM layout_state WHERE id = ?').get('default') as Record<string, unknown> | undefined
    if (!row) return null
    return {
      mode: row.mode as LayoutState['mode'],
      panels: JSON.parse(row.panels as string),
      activePanelIndex: row.active_panel_index as number,
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
      createdAt: row.created_at as number,
    }
  }

  close(): void {
    this.db.close()
  }
}
