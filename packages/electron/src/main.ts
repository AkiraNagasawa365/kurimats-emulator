/**
 * Electron メインプロセス
 * kurimats - Claude Code並列実行エミュレータ
 */

import { app, BrowserWindow, Menu, shell, nativeImage } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import * as http from 'http'
import Store from 'electron-store'
import { loadWindowState, saveWindowState, extractWindowState } from './window-state'
import { buildMenuTemplate } from './menu'
import { ServerProcessManager, resolveServerDir } from './server-process'
import { checkForUpdates } from './update-checker'

const APP_NAME = 'kurimats'
const DEV_CLIENT_URL = 'http://localhost:5173'
const SERVER_PORT = 13001
const IS_DEV = !app.isPackaged

let viteProcess: ChildProcess | null = null

/**
 * Vite devサーバーを起動し、準備完了を待つ
 */
function startViteDevServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const clientDir = path.resolve(__dirname, '../../client')
    viteProcess = spawn('npx', ['vite', '--port', '5173'], {
      cwd: clientDir,
      stdio: 'pipe',
      env: { ...process.env },
    })

    viteProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      console.log(`[vite] ${output.trim()}`)
      // Viteの起動完了を検出
      if (output.includes('Local:') || output.includes('localhost:5173')) {
        resolve()
      }
    })

    viteProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[vite] ${data.toString().trim()}`)
    })

    viteProcess.on('error', (err) => {
      console.error('Vite起動エラー:', err.message)
      reject(err)
    })

    viteProcess.on('exit', (code) => {
      console.log(`Viteが終了しました (コード: ${code})`)
      viteProcess = null
    })

    // タイムアウト: 30秒待っても起動しなければポーリングで確認
    setTimeout(() => {
      waitForUrl(DEV_CLIENT_URL, 10, 1000).then(resolve).catch(reject)
    }, 15000)
  })
}

/**
 * URLが応答するまでポーリングする
 */
function waitForUrl(url: string, retries: number, intervalMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve()
        } else if (++attempts < retries) {
          setTimeout(check, intervalMs)
        } else {
          reject(new Error(`${url} が応答しません`))
        }
      }).on('error', () => {
        if (++attempts < retries) {
          setTimeout(check, intervalMs)
        } else {
          reject(new Error(`${url} に接続できません`))
        }
      })
    }
    check()
  })
}

// 設定ストア
const store = new Store()

// サーバープロセス管理
const serverManager = new ServerProcessManager({
  spawnFn: spawn as any,
  serverDir: resolveServerDir(IS_DEV, process.resourcesPath),
  clientDir: IS_DEV ? undefined : path.join(process.resourcesPath, 'app-content', 'client'),
  isDev: IS_DEV,
})

let mainWindow: BrowserWindow | null = null

/**
 * メインウインドウを作成する
 */
function createWindow(): void {
  const windowState = loadWindowState(store as any)

  const iconPath = IS_DEV
    ? path.resolve(__dirname, '../resources/icon.png')
    : path.join(app.getAppPath(), 'resources', 'icon.png')

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 800,
    minHeight: 600,
    title: APP_NAME,
    icon: iconPath,
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
  // 本番でもサーバー経由でロード（APIが相対パスのため file:// では動かない）
  const clientUrl = IS_DEV ? DEV_CLIENT_URL : `http://localhost:${SERVER_PORT}`
  mainWindow.loadURL(clientUrl)

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
app.whenReady().then(async () => {
  // サーバーを自動起動
  serverManager.start(SERVER_PORT)

  if (IS_DEV) {
    // dev時はViteクライアントも起動して準備完了を待つ
    console.log('Vite devサーバーを起動中...')
    try {
      await startViteDevServer()
      console.log('Vite devサーバー準備完了')
    } catch (err) {
      console.error('Vite起動に失敗:', err)
    }
  } else {
    // 本番時はサーバーの起動を待つ
    console.log('サーバーの起動を待機中...')
    try {
      await waitForUrl(`http://localhost:${SERVER_PORT}/api/health`, 30, 1000)
      console.log('サーバー準備完了')
    } catch (err) {
      console.error('サーバー起動待機に失敗:', err)
    }
  }

  // macOS Dockアイコンを設定
  const iconPath = IS_DEV
    ? path.resolve(__dirname, '../resources/icon.png')
    : path.join(app.getAppPath(), 'resources', 'icon.png')
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(iconPath)
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon)
    }
  }

  // メニューを構築
  setupMenu()

  // メインウインドウを作成
  createWindow()

  // 更新チェック（本番のみ、バックグラウンドで実行）
  if (!IS_DEV) {
    checkForUpdates().catch((err) => {
      console.error('更新チェックに失敗:', err)
    })
  }

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

// アプリ終了前にサーバーとViteを停止
app.on('before-quit', () => {
  console.log('アプリケーション終了中...')
  serverManager.stop()
  if (viteProcess && !viteProcess.killed) {
    viteProcess.kill('SIGTERM')
    viteProcess = null
  }
})
