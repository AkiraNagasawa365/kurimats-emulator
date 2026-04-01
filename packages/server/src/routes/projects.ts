import { Router } from 'express'
import type { SessionStore } from '../services/session-store.js'
import type { CreateProjectParams } from '@kurimats/shared'

export function createProjectsRouter(store: SessionStore): Router {
  const router = Router()

  // プロジェクト一覧
  router.get('/', (_req, res) => {
    const projects = store.getAllProjects()
    res.json(projects)
  })

  // プロジェクト作成
  router.post('/', (req, res) => {
    const params = req.body as CreateProjectParams
    if (!params.name || !params.repoPath) {
      res.status(400).json({ error: 'name と repoPath は必須です' })
      return
    }
    const project = store.createProject(params)
    res.status(201).json(project)
  })

  // プロジェクト更新
  router.patch('/:id', (req, res) => {
    const updates = req.body as Partial<CreateProjectParams>
    store.updateProject(req.params.id, updates)
    res.json({ ok: true })
  })

  // プロジェクト削除
  router.delete('/:id', (req, res) => {
    store.deleteProject(req.params.id)
    res.json({ ok: true })
  })

  return router
}
