import { lazy, Suspense, useState } from 'react'
import { Upload } from 'lucide-react'
import { ResizableDocumentLayout } from './document-viewer/ResizableDocumentLayout'
const DocumentViewer = lazy(() => import('./document-viewer/DocumentViewer').then(module => ({default: module.DocumentViewer})))

export function ReviewPage() {
  const [file, setFile] = useState<File>()
  return <section className="docs-page" aria-label="Просмотр документа для проверки">
    <div className="docs-heading"><div><h1>Проверка</h1><p>Откройте PDF или DOCX для чтения. Файл обрабатывается в этом браузере.</p></div></div>
    <label className="docs-secondary review-file-picker"><Upload size={16}/> Выбрать документ<input aria-label="Документ для просмотра" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event => {const next = event.target.files?.[0]; if (next) setFile(next); event.target.value = ''}}/></label>{file && <span className="review-filename">{file.name}</span>}
    {file ? <ResizableDocumentLayout after={{id: 'review-notes', label: 'Замечания', defaultSize: '25%', content: <aside style={{padding: 16}}><h2>Замечания</h2><p>AI-проверка пока не подключена. Автоматические замечания не сформированы.</p></aside>}}>
      <Suspense fallback={<p>Загрузка просмотрщика…</p>}><DocumentViewer source={file} filename={file.name} mode="review"/></Suspense>
    </ResizableDocumentLayout> : <p className="docs-note">AI-проверка пока не подключена. Доступны чтение оригинала, поиск, масштабирование и скачивание.</p>}
  </section>
}
