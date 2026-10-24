import type { DocumentFormat, DocumentSource, SourceLoader } from './types'
import { requestResponse } from '../../shared/http'

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024
export function safeFilename(name: string, format: DocumentFormat) {
  const cleaned = name.replace(/\\/g, '/').split('/').pop()?.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim().slice(0, 180)
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : `document.${format}`
}
export const loadLocalSource: SourceLoader = async (url, signal) => {
  const target = new URL(url, window.location.href)
  if (target.origin !== window.location.origin || !['http:', 'https:'].includes(target.protocol)) {
    throw new Error('Используйте адрес документа на этом сервере или передайте Blob.')
  }
  const response = await requestResponse(target.pathname + target.search, {signal, redirect: 'error'})
  const size = Number(response.headers.get('content-length'))
  if (size > MAX_DOCUMENT_BYTES) throw new Error('Документ превышает допустимый размер 50 МБ.')
  // Bound streamed responses as well as responses without Content-Length.
  if (!response.body) return response.blob()
  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let received = 0
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > MAX_DOCUMENT_BYTES) throw new Error('Документ превышает допустимый размер 50 МБ.')
      chunks.push(new Uint8Array(value))
    }
    return new Blob(chunks, {type: response.headers.get('content-type') || ''})
  } catch (error) {await reader.cancel().catch(() => {}); throw error}
  finally {reader.releaseLock()}
}
export async function resolveSource(source: DocumentSource, signal: AbortSignal, loader: SourceLoader, format?: DocumentFormat, filename?: string) {
  const blob = typeof source === 'string' ? await loader(source, signal) : source instanceof Blob ? source : new Blob([source instanceof Uint8Array ? new Uint8Array(source) : source.slice(0)])
  signal.throwIfAborted()
  if (blob.size > MAX_DOCUMENT_BYTES) throw new Error('Документ превышает допустимый размер 50 МБ.')
  const header = new Uint8Array(await blob.slice(0, 8).arrayBuffer())
  signal.throwIfAborted()
  const detected = header[0] === 37 && header[1] === 80 && header[2] === 68 && header[3] === 70 ? 'pdf'
    : header[0] === 80 && header[1] === 75 && header[2] === 3 && header[3] === 4 ? 'docx' : undefined
  if (!detected || (format && detected !== format)) throw new Error('Файл повреждён или имеет неподдерживаемый формат. Выберите PDF или DOCX.')
  const name = filename || (source instanceof File ? source.name : typeof source === 'string' ? decodeURIComponent(new URL(source, window.location.href).pathname.split('/').pop() || '') : '')
  return {blob, format: detected as DocumentFormat, filename: safeFilename(name, detected)}
}
