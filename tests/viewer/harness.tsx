// Development-only fixture; not an application route or a production build entry.
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DocumentViewer, ResizableDocumentLayout, type DocumentSource, type DocumentViewerHandle } from '../../src/components/document-viewer'
function Harness() {
  const [source, setSource] = useState<DocumentSource>(), [filename, setFilename] = useState('')
  const [blob, setBlob] = useState<Blob>(), [quote, setQuote] = useState(''), [result, setResult] = useState('')
  const [readyVersion, setReadyVersion] = useState(0)
  const viewer = useRef<DocumentViewerHandle>(null)
  return <main style={{maxWidth: 1200, margin: 'auto'}}>
    <input type="file" aria-label="Fixture" onChange={event => {const file = event.target.files?.[0]; if (file) {setSource(file); setBlob(file); setFilename(file.name)}}}/>
    <button onClick={() => blob && setSource(new Blob([blob], {type: blob.type}))}>Replace Blob</button>
    <button onClick={async () => blob && setSource(await blob.arrayBuffer())}>ArrayBuffer</button>
    <button onClick={async () => blob && setSource(new Uint8Array(await blob.arrayBuffer()))}>Uint8Array</button>
    <button onClick={() => setSource('/api/viewer-fixture')}>URL</button>
    <button onClick={() => setSource('/api/viewer-slow')}>Slow URL</button>
    <button onClick={() => setSource('/api/viewer-failure')}>Failed URL</button>
    <button onClick={() => setSource('https://example.invalid/private.pdf')}>External URL</button>
    <input aria-label="Quote" value={quote} onChange={event => setQuote(event.target.value)}/>
    <button onClick={async () => {const value = await viewer.current?.highlightAnnotation({id: 'explicit-test', severity: 'info', message: 'Тестовая аннотация', location: {page: 2, quote}}); setResult(JSON.stringify(value))}}>Annotate</button>
    <button onClick={() => viewer.current?.clearHighlight()}>Clear</button>
    <button onClick={() => void viewer.current?.goToPage(40)}>Page 40</button><button onClick={async () => setResult(JSON.stringify(await viewer.current?.goToLocation({page: 3})))}>Location page</button><output data-testid="ready-version">{readyVersion}</output><output data-testid="navigation-result">{result}</output>
    {source && <ResizableDocumentLayout before={{id: 'test-before', label: 'Форма', content: <p>Форма</p>, defaultSize: '15%', minSize: '100px'}} after={{id: 'test-after', label: 'Замечания', content: <p>Явно обозначенные тестовые аннотации</p>, defaultSize: '15%', minSize: '100px'}}><DocumentViewer ref={viewer} documentId="fixture" source={source} filename={filename} mode="editor" onReady={() => setReadyVersion(value => value + 1)}/></ResizableDocumentLayout>}
  </main>
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness/></StrictMode>)
