import { expect, test } from '@playwright/test'

// Run against the explicit test-only ASGI provider; document/search endpoints are real.
test.beforeEach(async ({page}) => { await page.goto('/'); await page.getByRole('button', {name: 'Новый диалог', exact: true}).first().click() })
async function send(page: import('@playwright/test').Page, text: string) {
  await page.getByRole('textbox', {name: 'Ваш запрос'}).fill(text)
  await page.getByRole('button', {name: 'Отправить запрос', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Отправить запрос', exact: true})).toBeDisabled()
  await expect(page.locator('.chat-request-progress')).toHaveCount(0, {timeout: 30000})
}

test('agent creates form and natural-language update retains a manual field, then downloads a real DOCX', async ({page}) => {
  await send(page, 'Создай приказ о вводе информационной системы')
  let form = page.getByRole('region', {name: /Форма:/})
  await expect(form).toBeVisible()
  const id = (await page.request.get('/api/document-projects').then(r => r.json()))[0].projectId
  await form.getByLabel('Наименование организации').fill('Учебная организация')
  await form.getByRole('button', {name: 'Сохранить', exact: true}).click()
  await send(page, 'Ответственный Иванов, ввод с 1 декабря 2026')
  form = page.getByRole('region', {name: /Форма:/})
  await expect(form.getByLabel('Наименование организации')).toHaveValue('Учебная организация')
  await form.locator('summary').filter({hasText: 'Контроль и подписант'}).click()
  await expect(form.getByLabel('Ответственный за исполнение: должность и ФИО')).toHaveValue('Иванов')
  const project = await page.request.get(`/api/document-projects/${id}`).then(r => r.json())
  expect(project.fields).toMatchObject({organization: 'Учебная организация', responsible: 'Иванов', effectiveDate: '2026-12-01'})
  const template = await page.request.get(`/api/document-templates/${project.templateId}`).then(r => r.json())
  // Fill every declared field manually, including date/select/textarea in collapsed sections.
  for (const details of await form.locator('details').all()) await details.evaluate(e => (e as HTMLDetailsElement).open = true)
  for (const field of template.fields.filter((f: {required: boolean}) => f.required)) {
    const input = form.getByLabel(field.label + ' *', {exact: true})
    if (field.options.length) await input.selectOption(field.options[0])
    else await input.fill(field.inputType === 'date' ? '2026-12-01' : `Учебное ${field.key}`)
  }
  await form.getByRole('button', {name: 'Сохранить', exact: true}).click()
  await expect(form.getByText('Все изменения сохранены', {exact: true})).toBeVisible()
  await form.getByRole('button', {name: 'Проверить заполнение', exact: true}).click()
  await expect(form.getByRole('button', {name: 'Сформировать DOCX', exact: true})).toBeEnabled()
  await form.getByRole('button', {name: 'Предпросмотр', exact: true}).click()
  await expect(form.locator('.chat-form-preview')).toBeVisible()
  await form.getByRole('button', {name: 'Сформировать DOCX', exact: true}).click()
  await form.getByRole('button', {name: 'Подтвердить формирование DOCX', exact: true}).click()
  const download = page.waitForEvent('download')
  await form.getByRole('button', {name: 'Скачать DOCX', exact: true}).click()
  expect((await download).suggestedFilename()).toMatch(/system-commissioning-order.*\.docx$/)
  await form.getByRole('button', {name: 'Открыть полный редактор', exact: true}).click()
  await expect(page.getByRole('button', {name: 'Открыть в чате', exact: true})).toBeVisible()
  await page.getByRole('button', {name: 'Открыть в чате', exact: true}).click()
  await expect(page.getByRole('region', {name: /Форма:/})).toBeVisible()
  expect((await page.request.get('/api/document-projects').then(r => r.json())).length).toBe(1)
})

test('normative answer shows an exact citation and opens original', async ({page}) => {
  await send(page, 'Когда присваивается номер распоряжению?')
  const citation = page.locator('.citation-card').first()
  await expect(citation).toContainText('2.1')
  await citation.click()
  await expect(page.locator('.workspace-panel')).toBeVisible()
})

test('ambiguous request offers catalog; different modules work in chat and survive reload on mobile', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844})
  await send(page, 'Создай приказ')
  await expect(page.locator('.template-suggestion')).toHaveCount(7)
  await page.locator('.template-suggestion').filter({hasText: 'Приказ о назначении ответственных за делопроизводство'}).getByRole('button').click()
  const form = page.getByRole('region', {name: /Форма:/})
  await expect(form).toBeVisible()
  await form.getByLabel('Наименование организации').fill('Мобильный учебный проект')
  await form.getByRole('button', {name:'Сохранить', exact:true}).click()
  await expect(form.getByText('Все изменения сохранены', {exact:true})).toBeVisible()
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390)
  await page.reload()
  await page.getByRole('button', {name:'Открыть меню', exact:true}).click()
  await page.locator('.history-item').first().click()
  await expect(page.getByRole('region', {name:/Форма:/}).getByLabel('Наименование организации')).toHaveValue('Мобильный учебный проект')
})

test('provider failure preserves form and manual editing', async ({page}) => {
  await send(page, 'Создай приказ о вводе информационной системы')
  await send(page, 'Проверь сбой API')
  const form = page.getByRole('region', {name: /Форма:/})
  await expect(form).toBeVisible()
  await form.getByLabel('Наименование организации').fill('Работает без AI')
  await form.getByRole('button', {name:'Сохранить', exact:true}).click()
  await expect(form.getByText('Все изменения сохранены', {exact:true})).toBeVisible()
})

test('concurrent server edit keeps local draft and requires explicit resolution', async ({page}) => {
  await send(page, 'Создай приказ о вводе информационной системы')
  const form = page.getByRole('region', {name:/Форма:/})
  const [project] = await page.request.get('/api/document-projects').then(r => r.json())
  const session = await page.request.get('/api/session').then(r => r.json())
  await page.request.patch(`/api/document-projects/${project.projectId}`, {headers:{'X-CSRF-Token': session.csrfToken}, data:{expectedVersion:project.version, fields:{organization:'Серверная версия'}}})
  await form.getByLabel('Наименование организации').fill('Моя версия')
  await form.getByRole('button', {name:'Сохранить', exact:true}).click()
  await expect(form.getByText('На сервере версия 2', {exact:true})).toBeVisible()
  await expect(form.getByLabel('Наименование организации')).toHaveValue('Моя версия')
  await form.getByRole('button', {name:'Применить мои поля к новой версии'}).click()
  await expect(form.getByText('Все изменения сохранены', {exact:true})).toBeVisible()
})

test('cloud engine is disclosed and messages require synthetic-material acknowledgement', async ({page}) => {
  await page.route('**/api/chat/config', route => route.fulfill({json:{configured:true,provider:'deepseek',model:'deepseek-v4-pro',processing:'cloud',syntheticOnly:true}}))
  await page.reload()
  await page.getByRole('button', {name:'Новый диалог',exact:true}).first().click()
  await expect(page.locator('.ai-engine-notice')).toContainText('облачная обработка демо')
  await page.getByRole('textbox', {name:'Ваш запрос'}).fill('Учебный вопрос')
  await page.getByRole('button', {name:'Отправить запрос',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Подтвердите использование только синтетических материалов')
  await expect(page.locator('.message-row')).toHaveCount(0)
})

test('network retry reuses the original request and never creates a duplicate project', async ({page}) => {
  let sent = false
  await page.route('**/api/chat', async route => {
    if (!sent) {sent=true; await route.fetch(); await route.abort('failed')}
    else await route.continue()
  })
  await page.getByRole('textbox',{name:'Ваш запрос'}).fill('Создай приказ о вводе информационной системы')
  await page.getByRole('button',{name:'Отправить запрос',exact:true}).click()
  await expect(page.getByRole('button',{name:'Получить результат повторно'})).toBeVisible()
  expect((await page.request.get('/api/document-projects').then(r=>r.json())).length).toBe(1)
  await page.getByRole('button',{name:'Получить результат повторно'}).click()
  await expect(page.getByRole('region',{name:/Форма:/})).toBeVisible()
  expect((await page.request.get('/api/document-projects').then(r=>r.json())).length).toBe(1)
})
