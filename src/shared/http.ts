export class HttpError extends Error {
  constructor(public status: number, message: string) {super(message); this.name = 'HttpError'}
}

let csrfToken = ''
let sessionPromise: Promise<{deviceId: string; csrfToken: string}> | undefined

export function session() {
  // Bootstrap once before parallel reads: anonymous endpoints issue a new cookie,
  // so racing them could replace the session that supplied the CSRF token.
  if (!sessionPromise) sessionPromise = (async () => {
    const response = await fetch('/api/session', { credentials: 'same-origin' })
    if (!response.ok) throw new Error('Не удалось открыть сессию сервера')
    const result = await response.json() as {deviceId: string; csrfToken: string}
    csrfToken = result.csrfToken
    return result
  })().catch(error => {sessionPromise = undefined; throw error})
  return sessionPromise
}

// Downloads and JSON calls use the same bootstrap, cookies, CSRF and errors.
export async function requestResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const writes = !['GET', 'HEAD', 'OPTIONS'].includes((init.method || 'GET').toUpperCase())
  await session()
  const response = await fetch(path, {
    ...init, credentials: 'same-origin',
    headers: {
      ...(init.body instanceof FormData ? {} : {'Content-Type': 'application/json'}),
      ...(writes ? {'X-CSRF-Token': csrfToken} : {}), ...init.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new HttpError(response.status, typeof body.detail === 'string' ? body.detail : `HTTP ${response.status}`)
  }
  return response
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await requestResponse(path, init)).json() as Promise<T>
}
