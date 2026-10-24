import { expect, test } from '@playwright/test'

const question = 'Когда присваивается регистрационный номер проекту распоряжения?'

test('real search, source panel, knowledge deep link and honest Qwen status', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Рабочее пространство', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Чаты', exact: true }).click()
  await page.getByRole('textbox', { name: 'Ваш запрос' }).fill(question)
  await page.getByRole('button', { name: 'Отправить запрос' }).click()
  await expect(page.locator('.citation-card').first()).toContainText('2.1')
  await expect(page.locator('.message-row.assistant')).toContainText('Результат поиска по тексту документов')
  await page.locator('.citation-card').first().click()
  const panel = page.getByRole('complementary', { name: 'Рабочая панель' })
  await expect(panel.getByRole('link', { name: 'Открыть оригинал' }).first()).toHaveAttribute(
    'href',
    /\/api\/knowledge\/versions\//,
  )
  await panel.getByRole('button', { name: 'Открыть пункт в базе знаний' }).first().click()
  await expect(page.locator('.kb-source-text')).toContainText(
    'до его подписания и направления на регистрацию не присваивается',
  )
  await expect(page).toHaveURL(/#knowledge\/sections\//)
  await page.getByRole('button', { name: 'Спросить ИИ об этом пункте' }).click()
  await page.getByRole('button', { name: 'Отправить запрос' }).click()
  await expect(page.getByRole('alert')).toContainText('Автоматическое объяснение недоступно')
  await page.reload()
  await expect(page.locator('.history-item')).toHaveCount(2)
  await page.locator('.history-item').last().click()
  await expect(page.locator('.citation-card').first()).toContainText('2.1')
})

test('document edits survive navigation and a delayed validation; chat opens same server project', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Документы', exact: true }).click()
  await expect(page.locator('.docs-card')).toHaveCount(7)
  await page.locator('.docs-card').first().getByRole('button', { name: 'Создать проект' }).click()
  const title = page.getByRole('textbox', { name: 'Название проекта' })
  await title.fill('Сохранённый интеграционный проект')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.locator('.docs-editor-head')).toContainText('Сохранено')
  const originalCookie = (await page.context().cookies()).find((cookie) => cookie.name === 'regula_session')?.value
  let release!: () => void
  let intercepted!: () => void
  const pending = new Promise<void>((resolve) => {
    intercepted = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/document-projects/*/validate', async (route) => {
    const response = await route.fetch()
    intercepted()
    await gate
    await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Проверить', exact: true }).click()
  await pending
  await title.fill('Правка во время проверки')
  release()
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled()
  await expect(title).toHaveValue('Правка во время проверки')
  await expect(page.locator('.docs-editor-head')).toContainText('несохранённые изменения')
  await page.getByRole('button', { name: 'База знаний', exact: true }).click()
  await expect(page.locator('.kw-file-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Документы', exact: true }).click()
  await expect(title).toHaveValue('Правка во время проверки')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.locator('.docs-editor-head')).toContainText('Сохранено')
  await page.getByRole('button', { name: 'Открыть в чате', exact: true }).click()
  await expect(page.locator('.message-row.assistant')).toContainText('Открыт проект')
  await page.getByRole('button', { name: /^Открыть проект / }).click()
  await expect(title).toHaveValue('Правка во время проверки')
  expect((await page.context().cookies()).find((cookie) => cookie.name === 'regula_session')?.value).toBe(
    originalCookie,
  )
})

test('unconnected file checking never answers from a second normative corpus', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Чаты', exact: true }).click()
  await page.getByLabel('Выбрать файл').setInputFiles({
    name: 'fixture.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('test'),
  })
  await page.getByRole('textbox', { name: 'Ваш запрос' }).fill(question)
  await page.getByRole('button', { name: 'Отправить запрос' }).click()
  await expect(page.getByRole('alert')).toContainText('Файл не был проанализирован')
  await expect(page.locator('.citation-card')).toHaveCount(0)
})

test('order command recommends a real DOCX module and opens the created project', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Чаты', exact: true}).click()
  await page.getByRole('textbox', {name: 'Ваш запрос'}).fill('Создай приказ о назначении ответственных за делопроизводство')
  await page.getByRole('button', {name: 'Отправить запрос'}).click()
  const modules = page.getByRole('region', {name: 'Модули DOCX'})
  await expect(modules.locator('.template-suggestion')).toHaveCount(7)
  const recommended = modules.locator('.template-suggestion.recommended')
  await expect(recommended).toContainText('Приказ о назначении ответственных за делопроизводство')
  await recommended.getByRole('button', {name: 'Создать и открыть'}).click()
  await expect(page.locator('.docs-editor-head')).toBeVisible()
  await expect(page.getByRole('textbox', {name: 'Название проекта'})).toHaveValue(/Приказ о назначении ответственных за делопроизводство/)
  await page.getByRole('button', {name: 'Открыть в чате', exact: true}).click()
  await expect(page.getByText(/связь с этим чатом сохранена/)).toBeVisible()
})

test('working group wizard fills the existing project from the current field schema', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Чаты', exact: true}).click()
  await page.getByRole('textbox', {name: 'Ваш запрос'}).fill('Создай распоряжение о рабочей группе')
  await page.getByRole('button', {name: 'Отправить запрос'}).click()
  const recommended = page.getByRole('region', {name: 'Модули DOCX'}).locator('.template-suggestion.recommended')
  await expect(recommended).toContainText('Распоряжение о создании рабочей группы')
  await recommended.getByRole('button', {name: 'Создать и открыть'}).click()

  const wizard = page.getByRole('region', {name: 'Мастер рабочей группы'})
  await expect(wizard).toContainText('Шаг 1 из 3')
  await wizard.getByRole('button', {name: 'Да', exact: true}).click()
  await wizard.getByRole('button', {name: 'Далее'}).click()

  const template = (await (await page.request.get('/api/document-templates')).json()).find((item: {templateId: string}) => item.templateId === 'working-group-order')
  for (const spec of template.fields.filter((item: {required: boolean}) => item.required)) {
    const control = wizard.getByLabel(spec.label, {exact: false})
    if (spec.inputType === 'select') await control.selectOption({index: 1})
    else await control.fill(spec.inputType === 'date' ? '2026-12-31' : `Мастер ${spec.key}`)
  }
  await wizard.getByRole('button', {name: 'Далее'}).click()
  await expect(wizard).toContainText('Связь с ИТ')
  await expect(wizard).toContainText('Да')
  await wizard.getByRole('button', {name: 'Заполнить проект'}).click()

  await expect(page.locator('.docs-editor-head')).toBeVisible()
  await page.locator('.inspector-field-list [data-field-key="organization"]').click()
  await expect(page.locator('.field-editor').getByLabel('Наименование организации', {exact: true})).toHaveValue('Мастер organization')
  await page.getByRole('button', {name: 'Открыть в чате', exact: true}).click()
  await expect(page.getByRole('region', {name: 'Мастер рабочей группы'})).toContainText('Реквизиты сохранены')
})

test('generation keeps later edits and downloads a real saved DOCX', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Документы', exact: true }).click()
  await page.locator('.docs-card').first().getByRole('button', { name: 'Создать проект' }).click()
  const catalog = await (await page.request.get('/api/document-templates')).json()
  for (const spec of catalog[0].fields.filter((item: { required: boolean }) => item.required)) {
    await page.locator(`.inspector-field-list [data-field-key="${spec.key}"]`).click()
    await page
      .locator('.field-editor')
      .getByLabel(spec.label, { exact: true })
      .fill(spec.inputType === 'date' ? '2026-12-31' : `Интеграция ${spec.key}`)
  }
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.locator('.docs-editor-head')).toContainText('Сохранено')
  let release!: () => void
  let intercepted!: () => void
  const pending = new Promise<void>((resolve) => {
    intercepted = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/document-projects/*/generate', async (route) => {
    const response = await route.fetch()
    expect(response.status()).toBe(200)
    intercepted()
    await gate
    await route.fulfill({ response })
  })
  await page.getByRole('button', { name: 'Сформировать DOCX', exact: true }).click()
  await pending
  await page.getByRole('textbox', { name: 'Название проекта' }).fill('Новая правка после генерации')
  release()
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: 'Название проекта' })).toHaveValue('Новая правка после генерации')
  await expect(page.locator('.docs-editor-head')).toContainText('несохранённые изменения')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать версию 2', exact: true }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/\.docx$/)
  expect(await download.failure()).toBeNull()
  await page.getByRole('button', { name: 'Помощник', exact: true }).click()
  await page.getByRole('button', { name: 'Просмотреть DOCX', exact: true }).click()
  const viewer = page.locator('.docs-artifact-preview').getByRole('region', { name: 'Просмотр DOCX' })
  await expect(viewer.getByLabel('Масштаб DOCX')).toBeVisible()
  await expect(viewer.frameLocator('iframe[title="Страницы DOCX"]').locator('body')).toContainText(
    'Интеграция organization',
    { timeout: 30000 },
  )
})
