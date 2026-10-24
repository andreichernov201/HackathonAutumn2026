import { lazy, Suspense, useState } from 'react'
import { ResizableDocumentLayout } from './document-viewer/ResizableDocumentLayout'
import { Upload, FileSearch } from 'lucide-react'
import { EmptyState, LoadingState, PageHeader } from './ui'
const DocumentViewer = lazy(() =>
  import('./document-viewer/DocumentViewer').then((module) => ({
    default: module.DocumentViewer,
  })),
)
export function ReviewPage() {
  const [file, setFile] = useState<File>()
  return (
    <section className={`review-page ${file ? 'has-file' : ''}`} aria-label="Просмотр документа для проверки">
      <PageHeader title="Проверка" description="Оригинал документа и рабочие замечания">
        <label className="ui-button ui-button-secondary review-file-picker">
          <Upload size={16} />
          Выбрать документ
          <input
            aria-label="Документ для просмотра"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => {
              const next = event.target.files?.[0]
              if (next) setFile(next)
              event.target.value = ''
            }}
          />
        </label>
      </PageHeader>
      {file ? (
        <div className="review-workspace">
          <ResizableDocumentLayout
            after={{
              id: 'review-notes',
              label: 'Замечания',
              defaultSize: '25%',
              content: (
                <aside className="review-notes">
                  <h2>Замечания</h2>
                  <EmptyState title="Нет результатов проверки">
                    Документ открыт для чтения. Нормативная оценка не выполнялась.
                  </EmptyState>
                  <p className="docs-note">
                    Сопоставляйте формулировки с подтверждёнными источниками базы знаний. Просмотр не меняет исходный
                    файл.
                  </p>
                </aside>
              ),
            }}
          >
            <div className="review-original">
              <p className="review-filename">{file.name}</p>
              <Suspense fallback={<LoadingState />}>
                <DocumentViewer source={file} filename={file.name} mode="review" />
              </Suspense>
            </div>
          </ResizableDocumentLayout>
        </div>
      ) : (
        <div className="review-drop-area">
          <FileSearch size={32} />
          <EmptyState title="Откройте документ">
            PDF или DOCX · Поиск по тексту, масштаб и навигация по страницам
          </EmptyState>
        </div>
      )}
    </section>
  )
}
