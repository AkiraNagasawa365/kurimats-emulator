import { Router } from 'express'
import type { SshManager } from '../services/ssh-manager.js'

/**
 * SSH関連のRESTルーター
 */
export function createSshRouter(sshManager: SshManager): Router {
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

  return router
}
