import { describe, expect, it } from 'vitest'
import {
  decorateOpticalOrderedListMarkers,
  refreshOpticalOrderedListMarkerColumns,
} from './opticalListMarkers'

function directMarkers(list: HTMLOListElement): HTMLSpanElement[] {
  return Array.from(list.children).map(
    (item) =>
      Array.from(item.children).find((child) =>
        child.hasAttribute('data-optical-list-marker'),
      ) as HTMLSpanElement,
  )
}

function labels(list: HTMLOListElement): string[] {
  return directMarkers(list).map((marker) => marker.textContent ?? '')
}

describe('有序列表光学 marker', () => {
  it('保留 ol/li 语义，注入可访问序号文本且重复调用幂等', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<ol start="8"><li><p>八</p></li><li><p>九</p></li><li><p>十</p></li></ol>'
    const list = root.querySelector('ol')!

    expect(decorateOpticalOrderedListMarkers(root)).toBe(root)
    expect(labels(list)).toEqual(['8.', '9.', '10.'])
    expect(root.querySelectorAll('ol')).toHaveLength(1)
    expect(root.querySelectorAll('li')).toHaveLength(3)
    expect(list.getAttribute('start')).toBe('8')
    expect(list.dataset.opticalListMarkerColumns).toBe('3')
    expect(list.dataset.opticalListMarkerMaxLabel).toBe('10.')
    expect(
      list.style.getPropertyValue('--optical-list-marker-column-width'),
    ).toBe('3ch')

    const firstPass = root.innerHTML
    const markerNodes = directMarkers(list)
    markerNodes.forEach((marker) => {
      expect(marker.classList.contains('optical-list-marker')).toBe(true)
      expect(marker.hasAttribute('aria-hidden')).toBe(false)
      expect(marker.getAttribute('contenteditable')).toBe('false')
      expect(marker.parentElement?.firstChild).toBe(marker)
    })

    decorateOpticalOrderedListMarkers(root)
    expect(root.innerHTML).toBe(firstPass)
    expect(directMarkers(list)).toEqual(markerNodes)
    expect(root.querySelectorAll('[data-optical-list-marker]')).toHaveLength(3)
  })

  it('按 li[value] 跳号，并让后续编号从新值继续', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<ol start="4">',
      '<li>四</li>',
      '<li value="10">十</li>',
      '<li>十一</li>',
      '</ol>',
    ].join('')

    decorateOpticalOrderedListMarkers(root)
    const list = root.querySelector('ol')!

    expect(labels(list)).toEqual(['4.', '10.', '11.'])
    expect(list.children[1]?.getAttribute('value')).toBe('10')
  })

  it('支持 reversed 的默认起点、显式 start 与 li[value]', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<ol reversed><li>三</li><li>二</li><li>一</li></ol>',
      '<ol reversed start="8">',
      '<li>八</li><li value="20">二十</li><li>十九</li>',
      '</ol>',
    ].join('')

    decorateOpticalOrderedListMarkers(root)
    const lists = root.querySelectorAll('ol')

    expect(labels(lists[0])).toEqual(['3.', '2.', '1.'])
    expect(labels(lists[1])).toEqual(['8.', '20.', '19.'])
    expect(lists[0].hasAttribute('reversed')).toBe(true)
    expect(lists[1].getAttribute('start')).toBe('8')
  })

  it('为嵌套列表分层计数，外层不把内层 li 算入编号列', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<ol start="9">',
      '<li>外九<ol reversed><li>内三</li><li>内二</li><li>内一</li></ol></li>',
      '<li>外十</li>',
      '</ol>',
    ].join('')

    decorateOpticalOrderedListMarkers(root)
    const lists = root.querySelectorAll('ol')

    expect(labels(lists[0])).toEqual(['9.', '10.'])
    expect(labels(lists[1])).toEqual(['3.', '2.', '1.'])
    expect(lists[0].dataset.opticalListMarkerColumns).toBe('3')
    expect(lists[1].dataset.opticalListMarkerColumns).toBe('2')
    expect(root.querySelectorAll('[data-optical-list-marker]')).toHaveLength(5)
    expect(root.querySelectorAll('ol ol')).toHaveLength(1)
  })

  it('按当前字体的实测宽度选出最宽编号，字体就绪后可单独刷新', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<ol start="8"><li>八</li><li>九</li><li>十</li></ol>'
    const list = root.querySelector('ol')!
    const initialWidths: Record<string, number> = {
      '8.': 18.1251,
      '9.': 23.4561,
      '10.': 22.2,
    }

    decorateOpticalOrderedListMarkers(root, {
      measureMarkerWidth: (_marker, { label }) => initialWidths[label],
    })

    expect(list.dataset.opticalListMarkerMaxLabel).toBe('9.')
    expect(
      list.style.getPropertyValue('--optical-list-marker-column-width'),
    ).toBe('23.457px')

    refreshOpticalOrderedListMarkerColumns(root, {
      measureMarkerWidth: (_marker, { label }) =>
        label === '10.' ? 31.001 : 20,
    })
    expect(list.dataset.opticalListMarkerMaxLabel).toBe('10.')
    expect(
      list.style.getPropertyValue('--optical-list-marker-column-width'),
    ).toBe('31.001px')
    expect(labels(list)).toEqual(['8.', '9.', '10.'])
  })

  it('支持 HTML 字符串输入，二次装饰不改变输出', () => {
    const input =
      '<ol start="0"><li>零</li><li value="-2">负二</li><li>负一</li></ol>'

    const output = decorateOpticalOrderedListMarkers(input)
    const secondPass = decorateOpticalOrderedListMarkers(output)
    const parsed = new DOMParser().parseFromString(output, 'text/html')
    const list = parsed.querySelector('ol')!

    expect(secondPass).toBe(output)
    expect(labels(list)).toEqual(['0.', '-2.', '-1.'])
    expect(parsed.querySelectorAll('[data-optical-list-marker]')).toHaveLength(3)
    expect(parsed.querySelectorAll('ol')).toHaveLength(1)
    expect(parsed.querySelectorAll('li')).toHaveLength(3)
  })

  it('清理不再属于有序列表的旧 marker', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<ul><li><span data-optical-list-marker aria-hidden="true">1.</span>正文</li></ul>'

    decorateOpticalOrderedListMarkers(root)

    expect(root.querySelector('[data-optical-list-marker]')).toBeNull()
    expect(root.querySelector('ul')?.textContent).toBe('正文')
  })
})
