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

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const writes = Boolean(init.method && init.method !== 'GET')
  if (!csrfToken) await session()
  const response = await fetch(path, {
    credentials: 'same-origin', ...init,
    headers: {
      ...(init.body instanceof FormData ? {} : {'Content-Type': 'application/json'}),
      ...(writes ? {'X-CSRF-Token': csrfToken} : {}), ...init.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body.detail === 'string' ? body.detail : `HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}
