/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#ffffff',       // メイン背景
          1: '#f8f9fa',       // サイドバー
          2: '#e9ecef',       // ホバー
          3: '#dee2e6',       // アクティブ
        },
        accent: {
          DEFAULT: '#0066cc',
          hover: '#0052a3',
          light: '#e6f0ff',
        },
        border: '#e0e0e0',
        'text-primary': '#1a1a1a',
        'text-secondary': '#6b7280',
        'text-muted': '#9ca3af',
      },
    },
  },
  plugins: [],
}
