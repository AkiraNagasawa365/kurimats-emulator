import type Database from 'better-sqlite3'

export function runSessionStoreMigrations(db: Database.Database): void {
  db.exec(`
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

  db.exec(`
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

  try { db.exec("ALTER TABLE board_layout ADD COLUMN edges TEXT NOT NULL DEFAULT '[]'") } catch { /* カラム既存 */ }
  try { db.exec('ALTER TABLE sessions ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0') } catch { /* カラム既存 */ }
  try { db.exec('ALTER TABLE sessions ADD COLUMN project_id TEXT') } catch { /* カラム既存 */ }
  try { db.exec('ALTER TABLE sessions ADD COLUMN ssh_host TEXT') } catch { /* カラム既存 */ }
  try { db.exec('ALTER TABLE sessions ADD COLUMN is_remote INTEGER NOT NULL DEFAULT 0') } catch { /* カラム既存 */ }

  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'feature_request',
      priority TEXT NOT NULL DEFAULT 'medium',
      created_at INTEGER NOT NULL
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS ssh_hosts (
      name TEXT PRIMARY KEY,
      hostname TEXT NOT NULL,
      user TEXT NOT NULL DEFAULT 'root',
      port INTEGER NOT NULL DEFAULT 22,
      identity_file TEXT,
      last_connected INTEGER
    );
  `)

  db.exec(`
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS startup_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      ssh_preset_id TEXT,
      commands TEXT NOT NULL DEFAULT '[]',
      env_vars TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
  `)

  try { db.exec('ALTER TABLE projects ADD COLUMN ssh_preset_id TEXT') } catch { /* カラム既存 */ }
  try { db.exec('ALTER TABLE projects ADD COLUMN startup_template_id TEXT') } catch { /* カラム既存 */ }

  db.exec(`
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

  try { db.exec('ALTER TABLE cmux_workspaces ADD COLUMN repo_path TEXT NOT NULL DEFAULT \'\'') } catch { /* カラム既存 */ }
  try { db.exec('ALTER TABLE cmux_workspaces ADD COLUMN ssh_host TEXT') } catch { /* カラム既存 */ }
  try { db.exec('ALTER TABLE sessions ADD COLUMN workspace_id TEXT') } catch { /* カラム既存 */ }

  // Phase B: 開発インスタンス / スロット管理テーブル
  db.exec(`
    CREATE TABLE IF NOT EXISTS dev_instances (
      id TEXT PRIMARY KEY,
      slot_number INTEGER NOT NULL,
      server_port INTEGER NOT NULL,
      client_port INTEGER NOT NULL,
      playwright_port INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      pid INTEGER,
      worktree_path TEXT,
      assigned_session_id TEXT,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS slot_assignments (
      slot_number INTEGER PRIMARY KEY,
      instance_id TEXT NOT NULL UNIQUE,
      assigned_at INTEGER NOT NULL,
      FOREIGN KEY (instance_id) REFERENCES dev_instances(id) ON DELETE CASCADE
    );
  `)

  // slot_number の一意性を dev_instances テーブル側にも適用
  // （slot_assignments の PRIMARY KEY で排他、dev_instances 側は重複チェック用インデックス）
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dev_instances_slot
    ON dev_instances(slot_number);
  `)
}
