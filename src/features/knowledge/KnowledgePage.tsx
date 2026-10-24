import { useCallback, useEffect, useRef, useState } from 'react'
import { LockKeyhole, X } from 'lucide-react'
import { errorText, knowledgeApi } from './api'
import { KnowledgeWorkspace, type KnowledgeAsk } from './KnowledgeWorkspace'
import { knowledgeHash, readKnowledgeTarget, type ViewerTarget } from './routing'
import { UploadDialog } from './UploadDialog'
import type { KnowledgeDocument, KnowledgeSession } from './types'

export function KnowledgePage({onAsk, active = true}: {onAsk: KnowledgeAsk; active?: boolean}) {
  const [identity, setIdentity] = useState<KnowledgeSession>(), [identityError, setIdentityError] = useState('')
  const [target, setTarget] = useState<ViewerTarget>(readKnowledgeTarget)
  const [catalogReset, setCatalogReset] = useState(0)
  const [revision, setRevision] = useState(0), [upload, setUpload] = useState<KnowledgeDocument | 'new'>()
  const [loginOpen, setLoginOpen] = useState(false), [token, setToken] = useState(''), [loginError, setLoginError] = useState(''), [loginBusy, setLoginBusy] = useState(false)
  const loginDialog = useRef<HTMLDialogElement>(null)
  const admin = identity?.role === 'knowledge_admin'
  useEffect(() => {
    const read = () => {if (location.hash.startsWith('#knowledge')) setTarget(readKnowledgeTarget())}
    window.addEventListener('hashchange', read); window.addEventListener('popstate', read)
    return () => {window.removeEventListener('hashchange', read); window.removeEventListener('popstate', read)}
  }, [])
  useEffect(() => {
    let cancelled = false
    knowledgeApi.session().then(value => {if (!cancelled) {setIdentity(value); setIdentityError('')}}).catch(error => {if (!cancelled) setIdentityError(errorText(error))})
    return () => {cancelled = true}
  }, [revision])
  useEffect(() => {if (loginOpen) loginDialog.current?.showModal()}, [loginOpen])
  const navigate = useCallback((next: ViewerTarget, replace = false) => {
    const hash = knowledgeHash(next)
    if (location.hash !== hash) history[replace ? 'replaceState' : 'pushState'](null, '', hash)
    setTarget(next)
  }, [])
  async function login() {
    setLoginBusy(true); setLoginError('')
    try {await knowledgeApi.login(token); setIdentity(await knowledgeApi.session()); setToken(''); setLoginOpen(false); setRevision(value => value + 1)}
    catch (error) {setLoginError(errorText(error))} finally {setLoginBusy(false)}
  }
  async function logout() {
    try {await knowledgeApi.logout(); setIdentity(await knowledgeApi.session()); setRevision(value => value + 1)}
    catch (error) {setIdentityError(errorText(error))}
  }
  function uploaded(document: KnowledgeDocument) {
    setUpload(undefined); setRevision(value => value + 1); setCatalogReset(value => value + 1)
    navigate({documentId: document.id, versionId: document.latestVersion.id, tab: 'view'})
  }
  return <section className="kb-page kw-page">
    <KnowledgeWorkspace active={active} target={target} catalogReset={catalogReset} revision={revision} admin={admin} onNavigate={navigate} onAsk={onAsk} onUpload={setUpload} onReload={() => setRevision(value => value + 1)}/>
    <footer className="kb-footer"><span><LockKeyhole size={13}/> Локальная обработка · {admin ? 'Администратор базы' : 'Читатель'} · Демо-доступ</span>{identityError && <span role="alert">{identityError}<button onClick={() => setRevision(value => value + 1)}>Повторить</button></span>}{admin ? <button onClick={() => void logout()}>Завершить администрирование</button> : <button onClick={() => {setLoginError(''); setLoginOpen(true)}}>Управление базой</button>}</footer>
    {upload && admin && <UploadDialog document={upload === 'new' ? undefined : upload} onClose={() => setUpload(undefined)} onDone={uploaded}/>}
    {loginOpen && <dialog ref={loginDialog} className="kb-dialog kb-login" onClose={() => {setLoginOpen(false); setToken('')}}><form onSubmit={event => {event.preventDefault(); void login()}}><div className="kb-dialog-head"><h2>Управление базой знаний</h2><button type="button" className="icon-button" aria-label="Закрыть" onClick={() => {setLoginOpen(false); setToken('')}}><X size={20}/></button></div><p className="kb-muted">Локальный режим обслуживания. Корпоративная авторизация не подключена. Ключ задаёт оператор сервера.</p>{identity?.adminConfigured ? <><label>Ключ администратора<input type="password" autoComplete="current-password" value={token} onChange={event => setToken(event.target.value)} required maxLength={1024}/></label><button className="kb-button primary" disabled={loginBusy}>{loginBusy ? 'Проверка…' : 'Войти'}</button></> : <p className="kb-note">Вход администратора отключён. Для загрузки оператор должен настроить ключ обслуживания на сервере.</p>}{loginError && <p className="kb-error" role="alert">{loginError}</p>}</form></dialog>}
  </section>
}
