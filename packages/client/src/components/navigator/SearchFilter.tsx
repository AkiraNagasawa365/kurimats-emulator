interface SearchFilterProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/**
 * リアルタイムフィルタ入力
 * ナビゲーターの上部で使用
 */
export function SearchFilter({ value, onChange, placeholder = '検索...' }: SearchFilterProps) {
  return (
    <div className="px-3 py-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1 text-xs bg-surface-0 border border-border rounded
                   text-text-primary placeholder-text-muted
                   focus:border-accent focus:outline-none transition-colors"
      />
    </div>
  )
}
