import { useState, useEffect } from 'react'
import type { Project, SshPreset, StartupTemplate } from '@kurimats/shared'
import { useSshStore } from '../../stores/ssh-store'
import { projectsApi } from '../../lib/api'

interface Props {
  project: Project
  onClose: () => void
  onUpdated: () => void
}

/**
 * プロジェクト設定パネル
 * SSHプリセット・起動テンプレートの紐付けを管理
 */
export function ProjectSettingsPanel({ project, onClose, onUpdated }: Props) {
  const { presets, templates, fetchPresets, fetchTemplates } = useSshStore()
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(project.sshPresetId ?? null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(project.startupTemplateId ?? null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchPresets()
    fetchTemplates()
  }, [fetchPresets, fetchTemplates])

  const handleSave = async () => {
    setSaving(true)
    try {
      await projectsApi.update(project.id, {
        sshPresetId: selectedPresetId,
        startupTemplateId: selectedTemplateId,
      })
      onUpdated()
      onClose()
    } catch (e) {
      alert(`保存エラー: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  const selectedPreset = presets.find(p => p.id === selectedPresetId)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-chrome rounded-lg shadow-xl w-[480px] max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: project.color }}
            />
            <h2 className="text-sm font-bold text-text-primary">{project.name} 設定</h2>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded transition-colors"
          >
            ×
          </button>
        </div>

        {/* 設定内容 */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto custom-scrollbar">
          {/* SSHプリセット選択 */}
          <div>
            <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              SSH接続プリセット
            </label>
            <select
              value={selectedPresetId || ''}
              onChange={e => setSelectedPresetId(e.target.value || null)}
              className="w-full px-2.5 py-2 text-xs bg-surface-2 border border-border rounded text-text-primary outline-none focus:border-accent"
            >
              <option value="">なし（ローカル）</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.user}@{p.hostname})</option>
              ))}
            </select>
            {/* 選択中プリセットの詳細 */}
            {selectedPreset && (
              <div className="mt-2 p-2 bg-surface-2 rounded text-[11px] text-text-secondary space-y-1">
                <div>ホスト: <span className="text-text-primary">{selectedPreset.user}@{selectedPreset.hostname}:{selectedPreset.port}</span></div>
                <div>作業ディレクトリ: <span className="text-text-primary">{selectedPreset.defaultCwd}</span></div>
                {selectedPreset.startupCommand && (
                  <div>起動コマンド: <span className="text-accent">{selectedPreset.startupCommand}</span></div>
                )}
                {Object.keys(selectedPreset.envVars).length > 0 && (
                  <div>環境変数: <span className="text-text-primary">{Object.keys(selectedPreset.envVars).join(', ')}</span></div>
                )}
              </div>
            )}
          </div>

          {/* 起動テンプレート選択 */}
          <div>
            <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              起動テンプレート
            </label>
            <select
              value={selectedTemplateId || ''}
              onChange={e => setSelectedTemplateId(e.target.value || null)}
              className="w-full px-2.5 py-2 text-xs bg-surface-2 border border-border rounded text-text-primary outline-none focus:border-accent"
            >
              <option value="">なし</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.commands.length}コマンド)</option>
              ))}
            </select>
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs bg-surface-2 text-text-secondary hover:bg-surface-3 rounded transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-surface-0 rounded transition-colors font-medium disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
