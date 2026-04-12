import { describe, it, expect } from 'vitest'
import { extractPaneNumber, detectPaneNumber } from '@kurimats/shared'

describe('extractPaneNumber', () => {
  it('worktreeパスから pane 番号を抽出する', () => {
    expect(extractPaneNumber('/Users/user/repo/.kurimats-worktrees/repo-pane3')).toBe(3)
    expect(extractPaneNumber('/Users/user/repo/.kurimats-worktrees/repo-pane1')).toBe(1)
    expect(extractPaneNumber('/Users/user/repo/.kurimats-worktrees/repo-pane10')).toBe(10)
  })

  it('パスの途中に -paneN がある場合も抽出する', () => {
    expect(extractPaneNumber('/Users/user/repo/.kurimats-worktrees/repo-pane2/subdir')).toBe(2)
  })

  it('-paneN パターンがなければ null を返す', () => {
    expect(extractPaneNumber('/Users/user/repo')).toBeNull()
    expect(extractPaneNumber('/Users/user/Documents/kurimats-emulator')).toBeNull()
  })

  it('"pane" が含まれても -paneN 形式でなければ null を返す', () => {
    expect(extractPaneNumber('/Users/user/pane3/repo')).toBeNull()
    expect(extractPaneNumber('/Users/user/repo/panels')).toBeNull()
  })
})

describe('detectPaneNumber', () => {
  it('環境変数 PANE_NUMBER が設定されていれば優先する', () => {
    expect(detectPaneNumber({ PANE_NUMBER: '2' }, '/some/path')).toBe(2)
    expect(detectPaneNumber({ PANE_NUMBER: '0' }, '/some/path-pane5')).toBe(0)
  })

  it('環境変数がなければ CWD パスから検出する', () => {
    expect(detectPaneNumber({}, '/Users/user/repo/.kurimats-worktrees/repo-pane3')).toBe(3)
  })

  it('どちらも該当しなければ null を返す', () => {
    expect(detectPaneNumber({}, '/Users/user/repo')).toBeNull()
  })

  it('PANE_NUMBER が空文字列の場合は CWD にフォールバックする', () => {
    expect(detectPaneNumber({ PANE_NUMBER: '' }, '/path/repo-pane1')).toBe(1)
    expect(detectPaneNumber({ PANE_NUMBER: '' }, '/path/repo')).toBeNull()
  })

  it('PANE_NUMBER が非数値の場合は CWD にフォールバックする', () => {
    expect(detectPaneNumber({ PANE_NUMBER: 'abc' }, '/path/repo-pane2')).toBe(2)
    expect(detectPaneNumber({ PANE_NUMBER: 'abc' }, '/path/repo')).toBeNull()
  })
})
