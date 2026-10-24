import { expect, test } from '@playwright/test'
import { clampPage, escapeHtml, findTextMatches, highlightText } from '../../src/components/document-viewer/search'
import { resolveSource, safeFilename } from '../../src/components/document-viewer/source'

const pdf = new Blob(['%PDF-1.7\nfixture'], {type: 'application/pdf'})
test('search handles Cyrillic, NBSP, line breaks, cross-run highlights and HTML escaping', () => {
  const text = 'Номер\u00a0\n  ДОКУМЕНТА; номер документа'
  const matches = findTextMatches(text, 'номер документа')
  expect(matches).toHaveLength(2)
  expect(text.slice(matches[0].start, matches[0].end)).toBe('Номер\u00a0\n  ДОКУМЕНТА')
  const split = findTextMatches('регистрационный номер', 'регистрационный номер')
  expect(highlightText('регистрационный ', 0, split, split[0])).toContain('highlight selected')
  expect(highlightText('номер', 16, split)).toContain('<mark')
  expect(escapeHtml('<img src="x">&')).toBe('&lt;img src=&quot;x&quot;&gt;&amp;')
  expect(findTextMatches('text', '  ')).toEqual([])
  expect(clampPage(999, 51)).toBe(51)
  expect(clampPage(NaN, 51)).toBe(1)
})
test('sources are copied safely, detected by signature, reject bad formats and honor cancellation', async () => {
  const signal = new AbortController().signal
  const loader = async () => pdf
  expect((await resolveSource(pdf, signal, loader)).format).toBe('pdf')
  const array = new Uint8Array(await pdf.arrayBuffer())
  expect((await resolveSource(array, signal, loader)).blob.size).toBe(pdf.size)
  expect(array.byteLength).toBe(pdf.size)
  expect((await resolveSource(array.buffer, signal, loader)).format).toBe('pdf')
  expect((await resolveSource(new File([pdf], 'real.pdf'), signal, loader)).filename).toBe('real.pdf')
  await expect(resolveSource(new Blob(['bad']), signal, loader)).rejects.toThrow('повреждён')
  await expect(resolveSource(pdf, signal, loader, 'docx')).rejects.toThrow('повреждён')
  const cancelled = new AbortController(); cancelled.abort()
  await expect(resolveSource(pdf, cancelled.signal, loader)).rejects.toThrow()
  expect(safeFilename('../x/evil\u0000.docx', 'docx')).toBe('evil_.docx')
  expect(safeFilename('..', 'pdf')).toBe('document.pdf')
})
