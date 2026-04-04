import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SessionStore } from '../services/session-store'

/**
 * Phase 2: SSHプリセット + 起動テンプレートのテスト
 */
describe('SSHプリセット', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('SSHプリセットを作成できる', () => {
    const preset = store.createSshPreset({
      name: 'テスト用サーバー',
      hostname: '192.168.1.100',
      user: 'ubuntu',
      port: 22,
      defaultCwd: '/home/ubuntu/project',
      startupCommand: 'claude',
      envVars: { NODE_ENV: 'production' },
    })

    expect(preset.id).toBeDefined()
    expect(preset.name).toBe('テスト用サーバー')
    expect(preset.hostname).toBe('192.168.1.100')
    expect(preset.user).toBe('ubuntu')
    expect(preset.defaultCwd).toBe('/home/ubuntu/project')
    expect(preset.startupCommand).toBe('claude')
    expect(preset.envVars).toEqual({ NODE_ENV: 'production' })
  })

  it('全SSHプリセットを取得できる', () => {
    store.createSshPreset({ name: 'サーバーA', hostname: 'a.example.com', user: 'root', defaultCwd: '~' })
    store.createSshPreset({ name: 'サーバーB', hostname: 'b.example.com', user: 'root', defaultCwd: '~' })

    const presets = store.getAllSshPresets()
    expect(presets).toHaveLength(2)
  })

  it('SSHプリセットをIDで取得できる', () => {
    const created = store.createSshPreset({ name: 'テスト', hostname: 'test.com', user: 'root', defaultCwd: '~' })
    const found = store.getSshPreset(created.id)
    expect(found).not.toBeNull()
    expect(found!.name).toBe('テスト')
  })

  it('SSHプリセットを更新できる', () => {
    const created = store.createSshPreset({ name: '旧名', hostname: 'old.com', user: 'root', defaultCwd: '~' })
    const updated = store.updateSshPreset(created.id, { name: '新名', hostname: 'new.com' })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('新名')
    expect(updated!.hostname).toBe('new.com')
  })

  it('SSHプリセットを削除できる', () => {
    const created = store.createSshPreset({ name: '削除用', hostname: 'del.com', user: 'root', defaultCwd: '~' })
    const deleted = store.deleteSshPreset(created.id)
    expect(deleted).toBe(true)
    expect(store.getSshPreset(created.id)).toBeNull()
  })

  it('存在しないプリセットの削除はfalseを返す', () => {
    expect(store.deleteSshPreset('nonexistent')).toBe(false)
  })

  it('デフォルト値が正しく設定される', () => {
    const preset = store.createSshPreset({
      name: 'デフォルトテスト',
      hostname: 'example.com',
      user: 'ubuntu',
      defaultCwd: '/home/ubuntu',
    })

    expect(preset.port).toBe(22)
    expect(preset.identityFile).toBeNull()
    expect(preset.startupCommand).toBeNull()
    expect(preset.envVars).toEqual({})
  })
})

describe('起動テンプレート', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('起動テンプレートを作成できる', () => {
    const template = store.createStartupTemplate({
      name: 'Claude Code起動',
      commands: ['cd /project', 'claude'],
      envVars: { CLAUDE_MODEL: 'opus' },
    })

    expect(template.id).toBeDefined()
    expect(template.name).toBe('Claude Code起動')
    expect(template.commands).toEqual(['cd /project', 'claude'])
    expect(template.envVars).toEqual({ CLAUDE_MODEL: 'opus' })
    expect(template.sshPresetId).toBeNull()
  })

  it('SSHプリセットと紐付けた起動テンプレートを作成できる', () => {
    const preset = store.createSshPreset({ name: 'サーバー', hostname: 'example.com', user: 'root', defaultCwd: '~' })
    const template = store.createStartupTemplate({
      name: 'リモートClaude',
      sshPresetId: preset.id,
      commands: ['claude'],
    })

    expect(template.sshPresetId).toBe(preset.id)
  })

  it('全起動テンプレートを取得できる', () => {
    store.createStartupTemplate({ name: 'テンプレートA', commands: ['cmd1'] })
    store.createStartupTemplate({ name: 'テンプレートB', commands: ['cmd2'] })

    expect(store.getAllStartupTemplates()).toHaveLength(2)
  })

  it('起動テンプレートを削除できる', () => {
    const created = store.createStartupTemplate({ name: '削除用', commands: ['cmd'] })
    expect(store.deleteStartupTemplate(created.id)).toBe(true)
    expect(store.getStartupTemplate(created.id)).toBeNull()
  })
})

describe('プロジェクトSSH紐付け', () => {
  let store: SessionStore

  beforeEach(() => {
    store = new SessionStore(':memory:')
  })

  afterEach(() => {
    store.close()
  })

  it('プロジェクトにSSHプリセットを紐付けできる', () => {
    const project = store.createProject({ name: 'テストPJ', color: '#3b82f6', repoPath: '/path' })
    const preset = store.createSshPreset({ name: 'サーバー', hostname: 'example.com', user: 'root', defaultCwd: '~' })

    store.setProjectSshPreset(project.id, preset.id)
    const updated = store.getAllProjects().find(p => p.id === project.id)
    expect(updated?.sshPresetId).toBe(preset.id)
  })

  it('プロジェクトに起動テンプレートを紐付けできる', () => {
    const project = store.createProject({ name: 'テストPJ', color: '#3b82f6', repoPath: '/path' })
    const template = store.createStartupTemplate({ name: 'テンプレート', commands: ['claude'] })

    store.setProjectStartupTemplate(project.id, template.id)
    const updated = store.getAllProjects().find(p => p.id === project.id)
    expect(updated?.startupTemplateId).toBe(template.id)
  })

  it('紐付けを解除できる（nullを設定）', () => {
    const project = store.createProject({ name: 'テストPJ', color: '#3b82f6', repoPath: '/path' })
    const preset = store.createSshPreset({ name: 'サーバー', hostname: 'example.com', user: 'root', defaultCwd: '~' })

    store.setProjectSshPreset(project.id, preset.id)
    store.setProjectSshPreset(project.id, null)
    const updated = store.getAllProjects().find(p => p.id === project.id)
    expect(updated?.sshPresetId).toBeNull()
  })
})
