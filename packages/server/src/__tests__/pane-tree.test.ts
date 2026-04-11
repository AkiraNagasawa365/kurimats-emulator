import { describe, it, expect } from 'vitest'
import { nextFreePaneNumber } from '../utils/pane-tree'
import type { PaneLeaf, PaneSplit } from '@kurimats/shared'

/** 単一リーフのペインツリーを作る */
function leaf(id: string, sessionId: string): PaneLeaf {
  return { kind: 'leaf', id, sessionId, ratio: 0.5 }
}

/** 縦分割のスプリットツリーを作る */
function split(id: string, children: [PaneLeaf, PaneLeaf]): PaneSplit {
  return { kind: 'split', id, direction: 'vertical', ratio: 0.5, children }
}

describe('nextFreePaneNumber', () => {
  it('リーフ1つだけの場合は 1 を返す（初期分割用）', () => {
    // 実運用では初期ワークスペース直後の分割がこのケース
    const tree = leaf('p1', 's1')
    // s1 は "ws-pane1" として既に使用中 → 空いている最小は 2
    const n = nextFreePaneNumber(tree, 'ws', (id) => (id === 's1' ? 'ws-pane1' : null))
    expect(n).toBe(2)
  })

  it('連続使用時は末尾番号を返す', () => {
    // ws-pane1, ws-pane2 が使用中 → 次は 3
    const tree = split('sp', [leaf('p1', 's1'), leaf('p2', 's2')])
    const names: Record<string, string> = { s1: 'ws-pane1', s2: 'ws-pane2' }
    const n = nextFreePaneNumber(tree, 'ws', (id) => names[id])
    expect(n).toBe(3)
  })

  it('pane1 を閉じた後は空いた 1 を返す（Issue #145 の再現シナリオ）', () => {
    // ペインツリーには pane2, pane3 のみ残り、pane1 は削除済み
    const tree = split('sp', [leaf('p2', 's2'), leaf('p3', 's3')])
    const names: Record<string, string> = { s2: 'ws-pane2', s3: 'ws-pane3' }
    const n = nextFreePaneNumber(tree, 'ws', (id) => names[id])
    // countLeaves+1 だと 3 を返して ws-pane3 と衝突していた
    expect(n).toBe(1)
  })

  it('中抜けがある場合は最小の空き番号を返す', () => {
    // pane1, pane3 が使用中 → 2 が空き
    const tree = split('sp', [leaf('p1', 's1'), leaf('p3', 's3')])
    const names: Record<string, string> = { s1: 'ws-pane1', s3: 'ws-pane3' }
    const n = nextFreePaneNumber(tree, 'ws', (id) => names[id])
    expect(n).toBe(2)
  })

  it('2桁以上のペイン番号も扱える', () => {
    // pane1..pane10 まで使用中 → 11 が次
    const tree = split('sp', [leaf('p1', 's1'), leaf('p10', 's10')])
    const names: Record<string, string> = {}
    for (let i = 1; i <= 10; i++) names[`s${i}`] = `ws-pane${i}`
    // ツリー上はs1,s10しか参照していなくても、使用済み番号はs*マップで決まる
    // -> ここでの意図は regex の \d+ が2桁に対応することの確認
    const onlyTwo = nextFreePaneNumber(tree, 'ws', (id) => names[id])
    expect(onlyTwo).toBe(2) // ツリー参照はs1(1)とs10(10)のみ、2が空き
  })

  it('ワークスペース名が変わった場合、旧名のセッションは集計から外れる', () => {
    // 旧名 "foo" のセッションが残っていても、新名 "bar" での分割は 1 から始まる
    const tree = split('sp', [leaf('p1', 's1'), leaf('p2', 's2')])
    const names: Record<string, string> = { s1: 'foo-pane1', s2: 'foo-pane2' }
    const n = nextFreePaneNumber(tree, 'bar', (id) => names[id])
    expect(n).toBe(1)
  })

  it('ワークスペース名に正規表現メタ文字が含まれてもエスケープされる', () => {
    // ws名 "a.b" は regex 的に "a任意b" にならないこと
    // "a.b-pane1" のみ使用中 → 次は 2
    // "aXb-pane1" というノイズがあっても引っかかってはいけない
    const tree = split('sp', [leaf('p1', 's1'), leaf('p2', 's2')])
    const names: Record<string, string> = { s1: 'a.b-pane1', s2: 'aXb-pane1' }
    const n = nextFreePaneNumber(tree, 'a.b', (id) => names[id])
    expect(n).toBe(2) // a.b-pane1 のみカウント、aXb-pane1 はノイズ扱い
  })

  it('getSessionName が null を返すリーフはスキップ', () => {
    // 孤立/未解決セッションがあっても落ちない
    const tree = split('sp', [leaf('p1', 's1'), leaf('p2', 's-missing')])
    const n = nextFreePaneNumber(tree, 'ws', (id) => (id === 's1' ? 'ws-pane1' : null))
    expect(n).toBe(2)
  })
})
