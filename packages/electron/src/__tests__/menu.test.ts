import { describe, it, expect, vi } from 'vitest'
import {
  buildMenuTemplate,
  getMenuLabels,
  findSubmenu,
  MenuOptions,
} from '../menu'

describe('menu', () => {
  const baseOptions: MenuOptions = {
    appName: 'kurimats',
    isMac: true,
    onReload: vi.fn(),
    onToggleDevTools: vi.fn(),
    onQuit: vi.fn(),
  }

  describe('buildMenuTemplate - macOS', () => {
    it('macOSではアプリメニューが先頭に含まれる', () => {
      const template = buildMenuTemplate({ ...baseOptions, isMac: true })
      const labels = getMenuLabels(template)
      expect(labels[0]).toBe('kurimats')
    })

    it('必須メニュー（ファイル・編集・表示・ウインドウ）がすべて含まれる', () => {
      const template = buildMenuTemplate({ ...baseOptions, isMac: true })
      const labels = getMenuLabels(template)
      expect(labels).toContain('ファイル')
      expect(labels).toContain('編集')
      expect(labels).toContain('表示')
      expect(labels).toContain('ウインドウ')
    })

    it('macOSのウインドウメニューに「すべてを手前に移動」がある', () => {
      const template = buildMenuTemplate({ ...baseOptions, isMac: true })
      const windowSubmenu = findSubmenu(template, 'ウインドウ')
      expect(windowSubmenu).toBeDefined()
      const labels = windowSubmenu!.map((item) => item.label).filter(Boolean)
      expect(labels).toContain('すべてを手前に移動')
    })

    it('macOSアプリメニューに「終了」がある', () => {
      const template = buildMenuTemplate({ ...baseOptions, isMac: true })
      const appSubmenu = findSubmenu(template, 'kurimats')
      expect(appSubmenu).toBeDefined()
      const labels = appSubmenu!.map((item) => item.label).filter(Boolean)
      expect(labels).toContain('終了')
    })

    it('macOSファイルメニューに「ウインドウを閉じる」がある', () => {
      const template = buildMenuTemplate({ ...baseOptions, isMac: true })
      const fileSubmenu = findSubmenu(template, 'ファイル')
      expect(fileSubmenu).toBeDefined()
      const labels = fileSubmenu!.map((item) => item.label).filter(Boolean)
      expect(labels).toContain('ウインドウを閉じる')
    })
  })

  describe('buildMenuTemplate - Windows/Linux', () => {
    it('非macOSではアプリメニューが含まれない', () => {
      const template = buildMenuTemplate({ ...baseOptions, isMac: false })
      const labels = getMenuLabels(template)
      expect(labels[0]).not.toBe('kurimats')
      expect(labels[0]).toBe('ファイル')
    })

    it('非macOSのファイルメニューに「終了」がある', () => {
      const template = buildMenuTemplate({ ...baseOptions, isMac: false })
      const fileSubmenu = findSubmenu(template, 'ファイル')
      expect(fileSubmenu).toBeDefined()
      const labels = fileSubmenu!.map((item) => item.label).filter(Boolean)
      expect(labels).toContain('終了')
    })

    it('非macOSのウインドウメニューに「閉じる」がある', () => {
      const template = buildMenuTemplate({ ...baseOptions, isMac: false })
      const windowSubmenu = findSubmenu(template, 'ウインドウ')
      expect(windowSubmenu).toBeDefined()
      const labels = windowSubmenu!.map((item) => item.label).filter(Boolean)
      expect(labels).toContain('閉じる')
    })
  })

  describe('編集メニュー', () => {
    it('基本的な編集操作がすべて含まれる', () => {
      const template = buildMenuTemplate(baseOptions)
      const editSubmenu = findSubmenu(template, '編集')
      expect(editSubmenu).toBeDefined()

      const roles = editSubmenu!.map((item) => item.role).filter(Boolean)
      expect(roles).toContain('undo')
      expect(roles).toContain('redo')
      expect(roles).toContain('cut')
      expect(roles).toContain('copy')
      expect(roles).toContain('paste')
      expect(roles).toContain('selectAll')
    })

    it('セパレータが含まれる', () => {
      const template = buildMenuTemplate(baseOptions)
      const editSubmenu = findSubmenu(template, '編集')
      const separators = editSubmenu!.filter((item) => item.type === 'separator')
      expect(separators.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('表示メニュー', () => {
    it('再読み込みと開発者ツールが含まれる', () => {
      const template = buildMenuTemplate(baseOptions)
      const viewSubmenu = findSubmenu(template, '表示')
      expect(viewSubmenu).toBeDefined()
      const labels = viewSubmenu!.map((item) => item.label).filter(Boolean)
      expect(labels).toContain('再読み込み')
      expect(labels).toContain('開発者ツール')
    })

    it('ズーム関連のroleが含まれる', () => {
      const template = buildMenuTemplate(baseOptions)
      const viewSubmenu = findSubmenu(template, '表示')
      const roles = viewSubmenu!.map((item) => item.role).filter(Boolean)
      expect(roles).toContain('resetZoom')
      expect(roles).toContain('zoomIn')
      expect(roles).toContain('zoomOut')
      expect(roles).toContain('togglefullscreen')
    })

    it('再読み込みのクリックでコールバックが呼ばれる', () => {
      const onReload = vi.fn()
      const template = buildMenuTemplate({ ...baseOptions, onReload })
      const viewSubmenu = findSubmenu(template, '表示')
      const reloadItem = viewSubmenu!.find((item) => item.label === '再読み込み')
      expect(reloadItem?.click).toBeDefined()
      reloadItem!.click!()
      expect(onReload).toHaveBeenCalledOnce()
    })

    it('開発者ツールのクリックでコールバックが呼ばれる', () => {
      const onToggleDevTools = vi.fn()
      const template = buildMenuTemplate({ ...baseOptions, onToggleDevTools })
      const viewSubmenu = findSubmenu(template, '表示')
      const devToolsItem = viewSubmenu!.find((item) => item.label === '開発者ツール')
      expect(devToolsItem?.click).toBeDefined()
      devToolsItem!.click!()
      expect(onToggleDevTools).toHaveBeenCalledOnce()
    })

    it('macOSでは開発者ツールのショートカットがCmd+Option+Iになる', () => {
      const template = buildMenuTemplate({ ...baseOptions, isMac: true })
      const viewSubmenu = findSubmenu(template, '表示')
      const devToolsItem = viewSubmenu!.find((item) => item.label === '開発者ツール')
      expect(devToolsItem?.accelerator).toBe('Cmd+Option+I')
    })

    it('非macOSでは開発者ツールのショートカットがCtrl+Shift+Iになる', () => {
      const template = buildMenuTemplate({ ...baseOptions, isMac: false })
      const viewSubmenu = findSubmenu(template, '表示')
      const devToolsItem = viewSubmenu!.find((item) => item.label === '開発者ツール')
      expect(devToolsItem?.accelerator).toBe('Ctrl+Shift+I')
    })
  })

  describe('getMenuLabels', () => {
    it('トップレベルのラベル一覧を返す', () => {
      const template = buildMenuTemplate({ ...baseOptions, isMac: false })
      const labels = getMenuLabels(template)
      expect(labels).toEqual(['ファイル', '編集', '表示', 'ウインドウ'])
    })
  })

  describe('findSubmenu', () => {
    it('存在するメニューのサブメニューを返す', () => {
      const template = buildMenuTemplate(baseOptions)
      const submenu = findSubmenu(template, '編集')
      expect(submenu).toBeDefined()
      expect(submenu!.length).toBeGreaterThan(0)
    })

    it('存在しないメニューの場合はundefinedを返す', () => {
      const template = buildMenuTemplate(baseOptions)
      const submenu = findSubmenu(template, '存在しないメニュー')
      expect(submenu).toBeUndefined()
    })
  })
})
