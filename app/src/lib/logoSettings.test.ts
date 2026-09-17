import { Editor } from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import { describe, expect, it } from 'vitest'
import { createEditorExtensions } from '@/components/Editor/editorExtensions'
import { createEditorDocumentJSON } from '@/components/Editor/createEditorDocumentJSON'
import { BUILTIN_THEMES, normalizeTheme, type LogoStrategy } from './themes'
import { hydrateLogoSettings, preserveDraftPageLogos, isLogoVisible, normalizeLogoSettings, pageLogoTransaction, readPageLogoOverrides, resetPageLogosTransaction } from './logoSettings'
import { readPageLayouts } from './pageLayout'
const html = '<h1>合成封面</h1><hr class="page-break" data-page-id="a"><p>第二页</p><hr class="page-break" data-page-id="b"><p>第三页</p>'
const create = () => new Editor({ extensions: createEditorExtensions(), content: hydrateLogoSettings(createEditorDocumentJSON(html), { logoStrategy: 'every' }) })
const read = (e: Editor) => readPageLogoOverrides(e.getHTML(), normalizeLogoSettings(e.state.doc.attrs.logoSettings).coverVisibility)

describe('Logo scope and stable page ownership', () => {
  it.each([1, 2, 5])('resolves all strategy/override combinations for %i pages and keeps theme restrictions', total => {
    for (const strategy of ['every', 'first', 'first-last', 'none'] as LogoStrategy[]) for (let index = 0; index < total; index++) {
      const expected = strategy === 'every' || strategy === 'first' && index === 0 || strategy === 'first-last' && (index === 0 || index === total - 1)
      expect(isLogoVisible(strategy, 'inherit', index, total)).toBe(expected)
      expect(isLogoVisible(strategy, 'show', index, total)).toBe(true)
      expect(isLogoVisible(strategy, 'hide', index, total)).toBe(false)
      expect(isLogoVisible(strategy, 'show', index, total, 'theme-public-exam-landscape')).toBe(false)
    }
  })
  it('restores all followers in one undoable transaction including the first page', () => {
    const e = create()
    e.view.dispatch(closeHistory(pageLogoTransaction(e.state, 0, 'hide')))
    e.view.dispatch(closeHistory(pageLogoTransaction(e.state, 1, 'show')))
    expect(read(e)).toEqual(['hide', 'show', 'inherit'])
    const before = e.getJSON()
    e.view.dispatch(closeHistory(resetPageLogosTransaction(e.state)))
    expect(read(e)).toEqual(['inherit', 'inherit', 'inherit'])
    e.commands.undo(); expect(e.getJSON()).toEqual(before)
    e.commands.redo(); expect(read(e)).toEqual(['inherit', 'inherit', 'inherit'])
    e.destroy()
  })
  it('retains explicit pages when changing global strategy; restores strategy and position through history and JSON', () => {
    const e = create()
    e.view.dispatch(closeHistory(pageLogoTransaction(e.state, 2, 'show')))
    const settings = normalizeLogoSettings(e.state.doc.attrs.logoSettings)
    e.view.dispatch(closeHistory(e.state.tr.setDocAttribute('logoSettings', { ...settings, strategy: 'none', coverPosition: 'inner' })))
    expect(read(e)).toEqual(['inherit', 'inherit', 'show'])
    const restored = new Editor({ extensions: createEditorExtensions(), content: e.getJSON() })
    expect(restored.state.doc.attrs.logoSettings).toMatchObject({ strategy: 'none', coverPosition: 'inner' })
    expect(read(restored)).toEqual(read(e))
    e.commands.undo(); expect(e.state.doc.attrs.logoSettings).toMatchObject({ strategy: 'every', coverPosition: 'visible-area' })
    e.commands.redo(); expect(e.state.doc.attrs.logoSettings.coverPosition).toBe('inner')
    e.destroy(); restored.destroy()
  })
  it('inserts inherited boundaries, preserves existing identities, removes only deleted boundary settings and restores on undo', () => {
    const e = create()
    e.view.dispatch(closeHistory(pageLogoTransaction(e.state, 1, 'hide')))
    e.view.dispatch(closeHistory(pageLogoTransaction(e.state, 2, 'show')))
    e.view.dispatch(closeHistory(e.state.tr.insert(0, e.schema.nodes.horizontalRule.create())))
    expect(read(e)).toEqual(['inherit', 'inherit', 'hide', 'show'])
    expect(readPageLayouts(e.getHTML()).slice(2).map(p => p.id)).toEqual(['a', 'b'])
    let pos = -1
    e.state.doc.forEach((node, position) => { if(node.attrs.pageId === 'a') pos = position })
    e.view.dispatch(closeHistory(e.state.tr.delete(pos, pos + 1)))
    expect(read(e)).toEqual(['inherit', 'inherit', 'show'])
    e.commands.undo(); expect(read(e)).toEqual(['inherit', 'inherit', 'hide', 'show'])
    e.destroy()
  })
  it('copied configured boundaries receive a new identity with independent settings', () => {
    const e = create()
    e.view.dispatch(closeHistory(pageLogoTransaction(e.state, 1, 'hide')))
    const copy = e.schema.nodes.horizontalRule.create({ pageId: 'a', logoVisibility: 'hide' })
    e.view.dispatch(closeHistory(e.state.tr.insert(0, copy)))
    expect(readPageLayouts(e.getHTML())[1].id).not.toBe('a')
    expect(readPageLayouts(e.getHTML())[2].id).toBe('a')
    e.view.dispatch(closeHistory(pageLogoTransaction(e.state, 1, 'show')))
    expect(read(e)).toEqual(['inherit', 'show', 'hide', 'inherit'])
    e.destroy()
  })
  it('keeps legacy defaults and only saves visual cover position in themes', () => {
    expect(normalizeTheme(BUILTIN_THEMES[0])?.coverLogoPosition).toBe('visible-area')
    expect(normalizeTheme({ ...BUILTIN_THEMES[0], coverLogoPosition: 'inner', logoOverrides: { a: 'hide' } })).not.toHaveProperty('logoOverrides')
    expect(normalizeTheme({ ...BUILTIN_THEMES[0], coverLogoPosition: 'inner' })?.coverLogoPosition).toBe('inner')
    expect(normalizeLogoSettings({ coverPosition: 'invalid', coverVisibility: 'invalid' })).toEqual({ strategy: 'every', coverPosition: 'visible-area', coverVisibility: 'inherit' })
  })
})

it('migrates legacy hidden/top layout without changing its row reservation, and keeps it through later visibility changes', () => {
  const legacy = { type: 'doc', content: [{ type: 'paragraph' }, { type: 'horizontalRule', attrs: { pageId: 'old', pageVertical: 'top' } }, { type: 'paragraph' }] }
  for (const strategy of ['every', 'none'] as const) {
    const migrated = hydrateLogoSettings(legacy, { logoStrategy: strategy, logoAssetId: 'builtin-logo-cat' })
    const e = new Editor({ extensions: createEditorExtensions(), content: migrated })
    let reserved: unknown
    e.state.doc.forEach(n => { if(n.type.name === 'horizontalRule') reserved = n.attrs.logoLayoutReserved })
    expect(reserved).toBe(strategy === 'every')
    e.view.dispatch(pageLogoTransaction(e.state, 1, strategy === 'every' ? 'hide' : 'show'))
    e.state.doc.forEach(n => { if(n.type.name === 'horizontalRule') expect(n.attrs.logoLayoutReserved).toBe(reserved) })
    e.destroy()
  }
})

it('retains surviving draft page identities for legacy content templates without importing foreign overrides', () => {
  const current = { type: 'doc', content: [{ type: 'horizontalRule', attrs: { pageId: 'a', logoVisibility: 'hide', logoLayoutReserved: false } }] }
  const incoming = { type: 'doc', content: [{ type: 'horizontalRule', attrs: { pageId: 'foreign', logoVisibility: 'show' } }, { type: 'horizontalRule', attrs: { pageId: 'a', logoVisibility: 'show' } }] }
  const merged = preserveDraftPageLogos(incoming, current) as typeof incoming
  expect(merged.content.map(node => node.attrs.logoVisibility)).toEqual([null, 'hide'])
  expect(merged.content[1].attrs).toHaveProperty('logoLayoutReserved', false)
  expect(incoming.content[1].attrs.logoVisibility).toBe('show')
})
