/**
 * Electron メインプロセス
 * kurimats - Claude Code並列実行エミュレータ
 */

import { app, BrowserWindow, Menu, shell } from 'electron'
import { spawn } from 'child_process'
import Store from 'electron-store'
import { loadWindowState, saveWindowState, extractWindowState } from './window-state'
import { buildMenuTemplate } from './menu'
import { ServerProcessManager, resolveServerDir } from './server-process'

const APP_NAME = 'kurimats'
const DEV_CLIENT_URL = 'http://localhost:5173'
const SERVER_PORT = 3001
const IS_DEV = !app.isPackaged

// 設定ストア
const store = new Store()

// サーバープロセス管理
const serverManager = new ServerProcessManager({
  spawnFn: spawn as any,
  serverDir: resolveServerDir(IS_DEV, app.getAppPath()),
})

let mainWindow: BrowserWindow | null = null

/**
 * メインウインドウを作成する
 */
function createWindow(): void {
  const windowState = loadWindowState(store as any)

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // 最大化状態の復元
  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  // クライアントURLをロード
  if (IS_DEV) {
    mainWindow.loadURL(DEV_CLIENT_URL)
  } else {
    // ビルド後はローカルファイルを読み込む
    mainWindow.loadFile('../client/dist/index.html')
  }

  // 外部リンクをブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // ウインドウ状態の保存
  const saveState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      saveWindowState(store as any, extractWindowState(mainWindow))
    }
  }

  mainWindow.on('resize', saveState)
  mainWindow.on('move', saveState)
  mainWindow.on('maximize', saveState)
  mainWindow.on('unmaximize', saveState)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * アプリケーションメニューを構築する
 */
function setupMenu(): void {
  const template = buildMenuTemplate({
    appName: APP_NAME,
    isMac: process.platform === 'darwin',
    onReload: () => mainWindow?.webContents.reload(),
    onToggleDevTools: () => mainWindow?.webContents.toggleDevTools(),
    onQuit: () => app.quit(),
  })

  const menu = Menu.buildFromTemplate(template as any)
  Menu.setApplicationMenu(menu)
}

// アプリケーション起動
app.whenReady().then(() => {
  // サーバーを自動起動
  serverManager.start(SERVER_PORT)

  // メニューを構築
  setupMenu()

  // メインウインドウを作成
  createWindow()

  // macOS: ドックアイコンクリックでウインドウ再作成
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 全ウインドウ閉鎖時の処理
app.on('window-all-closed', () => {
  // macOSではCmd+Qまでアプリを維持
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// アプリ終了前にサーバーを停止
app.on('before-quit', () => {
  console.log('アプリケーション終了中...')
  serverManager.stop()
})
