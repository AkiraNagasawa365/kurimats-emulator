import { Router } from 'express'
import type { SshManager } from '../services/ssh-manager.js'
import type { SessionStore } from '../services/session-store.js'
import type { CreateSshPresetParams, CreateStartupTemplateParams } from '@kurimats/shared'

/**
 * SSH関連のRESTルーター
 */
export function createSshRouter(sshManager: SshManager, store?: SessionStore): Router {
  const router = Router()

  /**
   * SSHホスト一覧を取得
   */
  router.get('/hosts', (_req, res) => {
    const hosts = sshManager.getHosts()
    res.json(hosts)
  })

  /**
   * SSHホストに接続
   */
  router.post('/connect', async (req, res) => {
    const { host } = req.body as { host?: string }

    if (!host) {
      res.status(400).json({ error: 'host は必須です' })
      return
    }

    try {
      await sshManager.connect(host)
      res.json({ ok: true, status: 'online' })
    } catch (e) {
      res.status(500).json({ error: `SSH接続エラー: ${e}` })
    }
  })

  /**
   * SSHホストを切断
   */
  router.delete('/disconnect/:host', (req, res) => {
    const { host } = req.params

    try {
      sshManager.disconnect(host)
      res.json({ ok: true, status: 'offline' })
    } catch (e) {
      res.status(500).json({ error: `SSH切断エラー: ${e}` })
    }
  })

  /**
   * 全ホストの接続状態を取得
   */
  router.get('/status', (_req, res) => {
    const statuses = sshManager.getAllStatuses()
    res.json(statuses)
  })

  /**
   * SSHホスト一覧を再読み込み
   */
  router.post('/refresh', (_req, res) => {
    sshManager.refreshHosts()
    const hosts = sshManager.getHosts()
    res.json(hosts)
  })

  // ==================== SSHプリセット ====================

  if (store) {
    /** SSHプリセット一覧 */
    router.get('/presets', (_req, res) => {
      res.json(store.getAllSshPresets())
    })

    /** SSHプリセット作成 */
    router.post('/presets', (req, res) => {
      const params = req.body as CreateSshPresetParams
      if (!params.name || !params.hostname || !params.defaultCwd) {
        res.status(400).json({ error: 'name, hostname, defaultCwd は必須です' })
        return
      }
      const preset = store.createSshPreset(params)
      res.status(201).json(preset)
    })

    /** SSHプリセット更新 */
    router.patch('/presets/:id', (req, res) => {
      const updated = store.updateSshPreset(req.params.id, req.body)
      if (!updated) {
        res.status(404).json({ error: 'プリセットが見つかりません' })
        return
      }
      res.json(updated)
    })

    /** SSHプリセット削除 */
    router.delete('/presets/:id', (req, res) => {
      const deleted = store.deleteSshPreset(req.params.id)
      if (!deleted) {
        res.status(404).json({ error: 'プリセットが見つかりません' })
        return
      }
      res.json({ ok: true })
    })

    // ==================== 起動テンプレート ====================

    /** 起動テンプレート一覧 */
    router.get('/templates', (_req, res) => {
      res.json(store.getAllStartupTemplates())
    })

    /** 起動テンプレート作成 */
    router.post('/templates', (req, res) => {
      const params = req.body as CreateStartupTemplateParams
      if (!params.name || !params.commands?.length) {
        res.status(400).json({ error: 'name, commands は必須です' })
        return
      }
      const template = store.createStartupTemplate(params)
      res.status(201).json(template)
    })

    /** 起動テンプレート削除 */
    router.delete('/templates/:id', (req, res) => {
      const deleted = store.deleteStartupTemplate(req.params.id)
      if (!deleted) {
        res.status(404).json({ error: 'テンプレートが見つかりません' })
        return
      }
      res.json({ ok: true })
    })
  }

  return router
}
