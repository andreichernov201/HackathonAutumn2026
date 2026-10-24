import { expect, test } from '@playwright/test'
const matrix = '86beb4cd-942a-51d2-9eb4-dcc44bcf4157'
const guidance = '2e636d70-2c30-5063-99b5-175f79d8e44c'
// Trace snapshotting tries to inject scripts into the read-only DOCX sandbox.
test.use({ trace: 'off' })
const rows = (page: import('@playwright/test').Page) => page.locator('.kw-file-row')

test('workspace keeps PDF state across tabs; right panel resizes, collapses and remembers width', async ({ page }) => {
  await page.goto('/#knowledge')
  await expect(page.getByLabel('Номер страницы PDF')).toHaveAttribute('max', '51', { timeout: 30000 })
  await expect(rows(page)).toHaveCount(3)
  const fileBox = await page.locator('.kw-files').boundingBox(),
    viewerBox = await page.locator('.document-viewer').boundingBox()
  expect(fileBox!.x).toBeGreaterThan(viewerBox!.x)
  expect(fileBox!.width).toBeGreaterThanOrEqual(260)
  expect(fileBox!.width).toBeLessThanOrEqual(320)
  await page.getByLabel('Номер страницы PDF').fill('12')
  await page.getByLabel('Номер страницы PDF').press('Enter')
  await page.getByRole('button', { name: 'Сбросить масштаб' }).click()
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/original')) requests.push(request.url())
  })
  await page.getByRole('tab', { name: 'Содержание', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Содержание документа' })).toBeVisible()
  await page.getByRole('tab', { name: 'Сведения', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Сведения об источнике' })).toBeVisible()
  await expect(page.locator('.kw-technical')).not.toHaveAttribute('open', '')
  await page.getByRole('tab', { name: 'Просмотр', exact: true }).click()
  await expect(page.getByLabel('Номер страницы PDF')).toHaveValue('12')
  await expect(page.getByLabel('Масштаб PDF')).toHaveText('100%')
  expect(requests).toEqual([])
  const separator = page.getByRole('separator', { name: 'Изменить размер: Документы' })
  await separator.focus()
  await page.keyboard.press('ArrowLeft')
  await expect
    .poll(async () => (await page.locator('.kw-files').boundingBox())?.width)
    .toBeGreaterThan(fileBox!.width + 1)
  const changed = (await page.locator('.kw-files').boundingBox())!.width
  await page.getByRole('button', { name: 'Скрыть документы', exact: true }).click()
  await expect(page.locator('.kw-file-toggle')).toHaveAttribute('aria-expanded', 'false')
  await page.locator('.kw-file-toggle').click()
  await expect(page.locator('.kw-file-toggle')).toHaveAttribute('aria-expanded', 'true')
  await expect.poll(async () => (await page.locator('.kw-files').boundingBox())?.width).toBeGreaterThan(260)
  await page.reload()
  await expect(rows(page)).toHaveCount(3)
  expect(Math.abs((await page.locator('.kw-files').boundingBox())!.width - changed)).toBeLessThan(8)
})

test('real metadata and FTS search, filters, section citation and browser Back/Forward agree', async ({ page }) => {
  await page.goto('/#knowledge')
  await expect(rows(page)).toHaveCount(3)
  const search = page.getByLabel('Поиск по базе знаний')
  await search.fill('МАТРИЦА')
  await expect(rows(page)).toHaveCount(1)
  await rows(page).first().click()
  await expect(page.locator('.kw-current-title h1')).toContainText('Матрица обязательного')
  await expect(page.frameLocator('iframe[title="Страницы DOCX"]').locator('table').first()).toBeVisible({
    timeout: 30000,
  })
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать оригинал источника', exact: true }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/\.docx$/)
  expect(await download.failure()).toBeNull()
  await search.fill('Когда присваивается регистрационный номер проекту распоряжения?')
  await expect(page.locator('.kw-hit').first()).toContainText('2.1', { timeout: 10000 })
  await page.locator('.kw-hit').first().click()
  await expect(page).toHaveURL(/#knowledge\/sections\//)
  await expect(page.locator('.kw-current-title h1')).toContainText('Методические рекомендации')
  await expect(page.locator('.kb-source-text')).toContainText(
    'до его подписания и направления на регистрацию не присваивается',
  )
  await expect(page.locator('.kw-current-meta')).toContainText('Не подтверждён')
  const sectionUrl = page.url()
  await search.fill('')
  await expect(rows(page)).toHaveCount(3)
  await rows(page).filter({ hasText: 'Матрица обязательного' }).click()
  await expect(page).toHaveURL(new RegExp(`#knowledge/documents/${matrix}`))
  await page.goBack()
  await expect(page).toHaveURL(sectionUrl)
  await expect(page.locator('.kb-source-text')).toContainText('до его подписания')
  await page.goForward()
  await expect(page.locator('.kw-current-title h1')).toContainText('Матрица обязательного')
  await page.getByLabel('Категория документов').selectOption('matrix')
  await expect(rows(page)).toHaveCount(1)
  await page.locator('.kw-filters summary').click()
  await page.getByLabel('Статус редакции', { exact: true }).selectOption('active')
  await expect(rows(page)).toHaveCount(0)
  await page.getByLabel('Статус редакции', { exact: true }).selectOption('unverified')
  await expect(rows(page)).toHaveCount(1)
  await page.getByLabel('Формат', { exact: true }).selectOption('pdf')
  await expect(rows(page)).toHaveCount(0)
  await page.getByLabel('Формат', { exact: true }).selectOption('docx')
  await expect(rows(page)).toHaveCount(1)
})

test('TOC selection, point/document AI context, persistent links and stale search protection', async ({ page }) => {
  await page.goto(`/#knowledge/documents/${guidance}?tab=contents`)
  await page.getByLabel('Поиск по содержанию').fill('2.1')
  await page.locator('.kw-toc-target').filter({ hasText: '2.1' }).first().click()
  await expect(page.locator('.kb-source-text')).toContainText('до его подписания')
  const pointUrl = page.url()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: 'Ссылка на пункт', exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(pointUrl)
  await page.getByRole('button', { name: 'Спросить ИИ об этом пункте', exact: true }).click()
  await expect(page.getByLabel('Ваш запрос')).toHaveValue(/Объясни этот пункт/)
  await page.getByRole('button', { name: 'Отправить запрос' }).click()
  await expect(page.getByRole('alert')).toContainText('Автоматическое объяснение недоступно')
  await page.goto(pointUrl)
  await expect(page.locator('.kb-source-text')).toContainText('до его подписания')
  await page.locator('.kw-action-menu summary').click()
  await page.getByRole('button', { name: 'Спросить ИИ об этом документе', exact: true }).click()
  await expect(page.getByLabel('Ваш запрос')).toHaveValue(/Помоги разобраться с документом «Методические/)
  await page.goto('/#knowledge')
  await expect(rows(page)).toHaveCount(3)
  let release!: () => void, reached!: () => void
  const gate = new Promise<void>((resolve) => {
      release = resolve
    }),
    pending = new Promise<void>((resolve) => {
      reached = resolve
    })
  await page.route('**/api/knowledge/search?**', async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') === 'устаревшийответ') {
      const response = await route.fetch()
      reached()
      await gate
      await route.fulfill({ response }).catch(() => {})
    } else await route.continue()
  })
  await page.getByLabel('Поиск по базе знаний').fill('устаревшийответ')
  await pending
  await page.getByLabel('Поиск по базе знаний').fill('матрица')
  await expect(rows(page)).toHaveCount(1)
  release()
  await expect(rows(page).first()).toContainText('Матрица обязательного')
})

for (const size of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1024, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`real PDF and DOCX fit ${size.width}×${size.height}`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize(size)
    await page.goto('/#knowledge')
    await expect(page.getByLabel('Номер страницы PDF')).toHaveAttribute('max', '51', { timeout: 30000 })
    await expect(page.locator('.document-viewer canvas').first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const pdfOverflow = await page.locator('.dv-scroll').evaluate((node) => node.scrollWidth - node.clientWidth)
    expect(pdfOverflow).toBeLessThanOrEqual(2)
    await page.screenshot({ path: testInfo.outputPath(`knowledge-${size.width}-pdf.png`) })
    if (size.width <= 1100) {
      await page.locator('.kw-file-toggle').click()
      await expect(page.getByRole('dialog', { name: 'Документы', exact: true })).toBeVisible()
    }
    await rows(page).filter({ hasText: 'Матрица обязательного' }).click()
    await expect(page.frameLocator('iframe[title="Страницы DOCX"]').locator('table').first()).toBeVisible({
      timeout: 30000,
    })
    if (size.width <= 1100) await expect(page.getByRole('dialog', { name: 'Документы', exact: true })).not.toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      await page.locator('.dv-scroll').evaluate((node) => node.scrollWidth - node.clientWidth),
    ).toBeLessThanOrEqual(2)
    await page.screenshot({ path: testInfo.outputPath(`knowledge-${size.width}-docx.png`) })
    if (size.width <= 700) {
      await page.getByRole('button', { name: 'Открыть меню', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Чаты', exact: true })).toBeVisible()
    }
    expect(errors).toEqual([])
  })
}

test('admin upload, edition history, TXT original, restricted ACL and server pagination', async ({ page }) => {
  test.setTimeout(120000)
  const token = process.env.REGULA_TEST_ADMIN_TOKEN || process.env.REGULA_KNOWLEDGE_ADMIN_TOKEN
  test.skip(!token, 'An operator key is required on an isolated test API.')
  await page.goto('/#knowledge')
  await expect(page.getByRole('button', { name: 'Загрузить документ', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Управление базой', exact: true }).click()
  await page.getByLabel('Ключ администратора').fill(token!)
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await page.getByRole('button', { name: 'Загрузить документ', exact: true }).click()
  const dialog = page.getByRole('dialog'),
    marker = String(Date.now()),
    title = `Этап 02: проверка редакций ${marker}`
  await dialog.getByLabel('Название документа', { exact: true }).fill(title)
  await dialog.getByLabel('Категория', { exact: true }).selectOption('other')
  await dialog.getByLabel('Уровень доступа', { exact: true }).selectOption('restricted')
  await dialog
    .locator('input[type=file]')
    .setInputFiles({
      name: 'stage2.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('1. Тестовый источник\n1.1. Первая тестовая редакция этапа 02.'),
    })
  await dialog.getByRole('button', { name: 'Загрузить и проиндексировать', exact: true }).click()
  await expect(page.locator('.kw-current-title h1')).toHaveText(title)
  await expect(page.getByRole('region', { name: 'Просмотр TXT' })).toContainText('Первая тестовая редакция')
  const firstDocUrl = page.url(),
    firstVersion = new URLSearchParams(firstDocUrl.split('?')[1]).get('version')!
  await page.locator('.kw-action-menu summary').click()
  await page.getByRole('button', { name: 'Новая редакция', exact: true }).click()
  await dialog.getByLabel('Обозначение редакции, если установлено').fill('Тестовая редакция 2')
  await dialog
    .locator('input[type=file]')
    .setInputFiles({
      name: 'stage2.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('1. Тестовый источник\n1.1. Вторая тестовая редакция этапа 02.'),
    })
  await dialog.getByRole('button', { name: 'Загрузить и проиндексировать', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Просмотр TXT' })).toContainText('Вторая тестовая редакция')
  await page.getByRole('tab', { name: 'Сведения', exact: true }).click()
  await page.getByLabel('Редакция документа').selectOption(firstVersion)
  await expect(page).toHaveURL(new RegExp(`version=${firstVersion}`))
  await page.getByRole('tab', { name: 'Просмотр', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Просмотр TXT' })).toContainText('Первая тестовая редакция')
  await page.getByRole('tab', { name: 'Содержание', exact: true }).click()
  await page.locator('.kw-toc-target').first().click()
  const oldPointUrl = page.url()
  await page.reload()
  await expect(page.locator('.kb-source-text')).toContainText('Тестовый источник')
  await page.getByRole('tab', { name: 'Сведения', exact: true }).click()
  await expect(page.getByLabel('Редакция документа')).toHaveValue(firstVersion)
  const session = await (await page.request.get('/api/session')).json()
  for (let i = 0; i < 22; i++) {
    const response = await page.request.post('/api/knowledge/documents', {
      headers: { 'X-CSRF-Token': session.csrfToken },
      multipart: {
        metadata: JSON.stringify({
          title: `Пагинация ${marker} ${String(i).padStart(2, '0')}`,
          category: 'other',
          accessLevel: 'restricted',
          materialNature: 'synthetic',
          status: 'unverified',
        }),
        file: { name: 'pagination.txt', mimeType: 'text/plain', buffer: Buffer.from('Тестовая фикстура пагинации.') },
      },
    })
    expect(response.status()).toBe(201)
  }
  await page.reload()
  await expect(page.locator('.kb-source-text')).not.toBeVisible()
  await page.getByLabel('Категория документов').selectOption('other')
  await page.getByLabel('Поиск по базе знаний').fill(marker)
  await expect(rows(page).first()).toContainText(marker)
  await expect(rows(page)).toHaveCount(20)
  const pagination = page.getByLabel('Страницы документов', { exact: true })
  await expect(pagination).toContainText('/ 23')
  await pagination.getByRole('button', { name: 'Далее', exact: true }).click()
  await expect(rows(page)).toHaveCount(3)
  await page.getByRole('button', { name: 'Завершить администрирование', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Загрузить документ', exact: true })).toHaveCount(0)
  await page.goto(oldPointUrl)
  await expect(page.getByRole('alert').filter({ hasText: 'не найден или недоступен' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Просмотр TXT' })).toHaveCount(0)
})

test('API failure shows no invented sources; original failure offers extracted text and recovers', async ({ page }) => {
  await page.route('**/api/knowledge/documents?**', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Сервер временно недоступен' } }),
  )
  await page.goto('/#knowledge')
  await expect(page.getByRole('alert')).toContainText('Проверьте доступность API')
  await expect(rows(page)).toHaveCount(0)
  await expect(page.locator('.document-viewer')).toHaveCount(0)
  await page.unroute('**/api/knowledge/documents?**')
  await page.route('**/api/knowledge/versions/*/original', (route) =>
    route.fulfill({ status: 409, json: { detail: 'source_integrity_error' } }),
  )
  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await expect(rows(page)).toHaveCount(3)
  await page.getByRole('button', { name: 'Открыть содержание и извлечённый текст', exact: true }).click()
  await page.locator('.kw-toc-target').first().click()
  await expect(page.locator('.kb-source-text')).toBeVisible()
  await page.unroute('**/api/knowledge/versions/*/original')
  await page.getByRole('button', { name: 'Повторить открытие', exact: true }).click()
  await expect(page.getByLabel('Номер страницы PDF')).toHaveAttribute('max', '51', { timeout: 30000 })
})
