/**
 * macOS メニューバー構築モジュール
 */

/** メニューアイテムの型定義（Electron APIの簡略版） */
export interface MenuItemTemplate {
  label?: string
  role?: string
  type?: 'separator' | 'normal' | 'submenu'
  submenu?: MenuItemTemplate[]
  accelerator?: string
  click?: () => void
}

/** メニューテンプレート生成オプション */
export interface MenuOptions {
  appName: string
  isMac: boolean
  onReload?: () => void
  onToggleDevTools?: () => void
  onQuit?: () => void
}

/**
 * アプリケーションメニューのテンプレートを生成する
 */
export function buildMenuTemplate(options: MenuOptions): MenuItemTemplate[] {
  const { appName, isMac, onReload, onToggleDevTools, onQuit } = options
  const template: MenuItemTemplate[] = []

  // macOSアプリメニュー
  if (isMac) {
    template.push({
      label: appName,
      submenu: [
        { role: 'about', label: `${appName}について` },
        { type: 'separator' },
        { role: 'services', label: 'サービス' },
        { type: 'separator' },
        { role: 'hide', label: `${appName}を隠す` },
        { role: 'hideOthers', label: 'ほかを隠す' },
        { role: 'unhide', label: 'すべてを表示' },
        { type: 'separator' },
        {
          label: '終了',
          accelerator: 'CmdOrCtrl+Q',
          click: onQuit,
        },
      ],
    })
  }

  // ファイルメニュー
  template.push({
    label: 'ファイル',
    submenu: [
      ...(isMac
        ? [{ role: 'close' as const, label: 'ウインドウを閉じる' }]
        : [{ label: '終了', accelerator: 'CmdOrCtrl+Q', click: onQuit }]),
    ],
  })

  // 編集メニュー
  template.push({
    label: '編集',
    submenu: [
      { role: 'undo', label: '元に戻す' },
      { role: 'redo', label: 'やり直す' },
      { type: 'separator' },
      { role: 'cut', label: '切り取り' },
      { role: 'copy', label: 'コピー' },
      { role: 'paste', label: '貼り付け' },
      { role: 'selectAll', label: 'すべてを選択' },
    ],
  })

  // 表示メニュー
  template.push({
    label: '表示',
    submenu: [
      {
        label: '再読み込み',
        accelerator: 'CmdOrCtrl+R',
        click: onReload,
      },
      {
        label: '開発者ツール',
        accelerator: isMac ? 'Cmd+Option+I' : 'Ctrl+Shift+I',
        click: onToggleDevTools,
      },
      { type: 'separator' },
      { role: 'resetZoom', label: '実際のサイズ' },
      { role: 'zoomIn', label: '拡大' },
      { role: 'zoomOut', label: '縮小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'フルスクリーン' },
    ],
  })

  // ウインドウメニュー
  template.push({
    label: 'ウインドウ',
    submenu: [
      { role: 'minimize', label: '最小化' },
      { role: 'zoom', label: 'ズーム' },
      ...(isMac
        ? [
            { type: 'separator' as const },
            { role: 'front' as const, label: 'すべてを手前に移動' },
          ]
        : [{ role: 'close' as const, label: '閉じる' }]),
    ],
  })

  return template
}

/**
 * メニューテンプレートからラベルのフラットリストを取得する（テスト用ユーティリティ）
 */
export function getMenuLabels(template: MenuItemTemplate[]): string[] {
  return template
    .map((item) => item.label)
    .filter((label): label is string => label !== undefined)
}

/**
 * 特定のメニューラベルのサブメニューを取得する
 */
export function findSubmenu(
  template: MenuItemTemplate[],
  label: string
): MenuItemTemplate[] | undefined {
  const menu = template.find((item) => item.label === label)
  return menu?.submenu
}
