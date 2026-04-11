import { useState, useEffect } from 'react'
import type { FeedbackCategory, FeedbackPriority } from '@kurimats/shared'
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_PRIORITY_LABELS } from '@kurimats/shared'
import { useFeedbackStore } from '../../stores/feedback-store'

/**
 * フィードバックパネル
 * フィードバック入力フォームと一覧表示
 */
export function FeedbackPanel({ onClose }: { onClose: () => void }) {
  const { feedbackList, loading, fetchFeedback, createFeedback, deleteFeedback } = useFeedbackStore()
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [category, setCategory] = useState<FeedbackCategory>('feature_request')
  const [priority, setPriority] = useState<FeedbackPriority>('medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchFeedback()
  }, [fetchFeedback])

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('タイトルは必須です')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createFeedback({ title: title.trim(), detail: detail.trim(), category, priority })
      setTitle('')
      setDetail('')
      setCategory('feature_request')
      setPriority('medium')
    } catch (e) {
      setError(`送信エラー: ${e}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteFeedback(id)
    } catch (e) {
      setError(`削除エラー: ${e}`)
    }
  }

  const priorityColor = (p: FeedbackPriority) => {
    switch (p) {
      case 'high': return 'bg-red-900/30 text-red-400'
      case 'medium': return 'bg-yellow-900/30 text-yellow-400'
      case 'low': return 'bg-green-900/30 text-green-400'
    }
  }

  const categoryIcon = (c: FeedbackCategory) => {
    switch (c) {
      case 'feature_request': return '💡'
      case 'bug_report': return '🐛'
      case 'improvement': return '🔧'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-chrome rounded-lg shadow-xl w-[640px] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-text-primary">フィードバック</h2>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-2 rounded transition-colors"
          >
            ×
          </button>
        </div>

        {/* 入力フォーム */}
        <div className="px-5 py-4 border-b border-border space-y-3">
          <input
            type="text"
            placeholder="タイトル"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded text-text-primary placeholder-text-muted focus:border-accent outline-none"
            data-testid="feedback-title-input"
            autoFocus
          />
          <textarea
            placeholder="詳細（任意）"
            value={detail}
            onChange={e => setDetail(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded text-text-primary placeholder-text-muted focus:border-accent outline-none resize-none"
            data-testid="feedback-detail-input"
          />
          <div className="flex gap-3">
            {/* カテゴリ選択 */}
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                カテゴリ
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as FeedbackCategory)}
                className="w-full px-2.5 py-1.5 text-xs bg-surface-2 border border-border rounded text-text-primary outline-none focus:border-accent"
                data-testid="feedback-category-select"
              >
                {(Object.entries(FEEDBACK_CATEGORY_LABELS) as [FeedbackCategory, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            {/* 優先度選択 */}
            <div className="flex-1">
              <label className="block text-[10px] font-semibold text-text-secondary uppercase tracking-wider mb-1">
                優先度
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as FeedbackPriority)}
                className="w-full px-2.5 py-1.5 text-xs bg-surface-2 border border-border rounded text-text-primary outline-none focus:border-accent"
                data-testid="feedback-priority-select"
              >
                {(Object.entries(FEEDBACK_PRIORITY_LABELS) as [FeedbackPriority, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full px-3 py-2 text-sm bg-accent hover:bg-accent-hover text-surface-0 rounded transition-colors font-medium disabled:opacity-50"
            data-testid="feedback-submit-button"
          >
            {submitting ? '送信中...' : '送信'}
          </button>
        </div>

        {/* 一覧 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <p className="px-5 py-4 text-xs text-text-muted text-center">読み込み中...</p>
          ) : feedbackList.length === 0 ? (
            <p className="px-5 py-4 text-xs text-text-muted text-center">フィードバックはありません</p>
          ) : (
            <div className="divide-y divide-border">
              {feedbackList.map(fb => (
                <div key={fb.id} className="px-5 py-3 hover:bg-chrome transition-colors group" data-testid="feedback-item">
                  <div className="flex items-start gap-2">
                    <span className="text-sm flex-shrink-0">{categoryIcon(fb.category)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary truncate">{fb.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${priorityColor(fb.priority)}`}>
                          {FEEDBACK_PRIORITY_LABELS[fb.priority]}
                        </span>
                        <span className="text-[10px] text-text-muted flex-shrink-0">
                          {FEEDBACK_CATEGORY_LABELS[fb.category]}
                        </span>
                      </div>
                      {fb.detail && (
                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{fb.detail}</p>
                      )}
                      <p className="text-[10px] text-text-muted mt-1">
                        {new Date(fb.createdAt).toLocaleString('ja-JP')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(fb.id)}
                      className="text-text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 text-xs"
                      data-testid="feedback-delete-button"
                      title="削除"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
