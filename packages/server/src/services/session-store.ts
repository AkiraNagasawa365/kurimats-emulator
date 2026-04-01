import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Session, CreateSessionParams } from '@kurimats/shared'
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
    import('fs').then(fs => fs.mkdirSync(dir, { recursive: true }))

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
    `)
  }

  /**
   * セッション作成
   */
  create(params: CreateSessionParams & { worktreePath?: string | null }): Session {
    const now = Date.now()
    const session: Session = {
      id: uuidv4(),
      name: params.name,
      repoPath: params.repoPath,
      worktreePath: params.worktreePath ?? null,
      branch: params.baseBranch ?? null,
      status: 'active',
      claudeSessionId: null,
      createdAt: now,
      lastActiveAt: now,
    }

    this.db.prepare(`
      INSERT INTO sessions (id, name, repo_path, worktree_path, branch, status, claude_session_id, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id, session.name, session.repoPath, session.worktreePath,
      session.branch, session.status, session.claudeSessionId,
      session.createdAt, session.lastActiveAt
    )

    return session
  }

  /**
   * 全セッション取得
   */
  getAll(): Session[] {
    return this.db.prepare('SELECT * FROM sessions ORDER BY last_active_at DESC').all().map(this.mapRow)
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
      createdAt: row.created_at as number,
      lastActiveAt: row.last_active_at as number,
    }
  }

  close(): void {
    this.db.close()
  }
}
