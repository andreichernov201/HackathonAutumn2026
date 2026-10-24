import { expect, test } from '@playwright/test'

test('independent scroll, responsive shell and keyboard save in the document', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Документы', exact: true }).click()
  await page.locator('.docs-card').first().getByRole('button', { name: 'Создать проект' }).click()
  const frame = page.locator('.docs-live-preview').frameLocator('iframe[title="Страницы DOCX"]')
  const organization = frame.locator('[data-field-id="organization"]').first()
  await expect(organization).toBeVisible({ timeout: 30000 })
  await organization.fill('Рабочая организация')
  await organization.press('ControlOrMeta+s')
  await expect(page.locator('.docs-editor-head')).toContainText('Сохранено')
  await expect(page.locator('.docs-editor-head')).toContainText('Версия 2')
  await page.getByRole('button', { name: 'Закрыть контекстную панель' }).click()
  for (const size of [
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size)
    if (size.width <= 700) await expect(page.locator('.sidebar')).toBeHidden()
    const before = await page.locator('.sidebar').boundingBox()
    await page.locator('.docs-document .dv-scroll').evaluate((node) => {
      node.scrollTop = 600
    })
    const after = await page.locator('.sidebar').boundingBox()
    expect(after?.y).toBe(before?.y)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0)
    const stage = await page.locator('.docs-document .dv-stage').boundingBox()
    expect(stage!.height).toBeGreaterThan(200)
    await page.screenshot({
      path: testInfo.outputPath(`editor-${size.width}.png`),
    })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'База знаний', exact: true }).click()
  await page.getByRole('button', { name: 'Документы', exact: true }).click()
  await expect(page.locator('.docs-editor-head')).toContainText('Версия 2')
  await expect(frame.getByText('Рабочая организация', { exact: true })).toBeAttached()
})

test('version conflict exposes both drafts and never overwrites silently', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Документы', exact: true }).click()
  await page.locator('.docs-card').first().getByRole('button', { name: 'Создать проект' }).click()
  const title = page.getByRole('textbox', { name: 'Название проекта' })
  await title.fill('Мои изменения')
  const projects = await (await page.request.get('/api/document-projects')).json()
  const session = await (await page.request.get('/api/session')).json()
  await page.request.patch(`/api/document-projects/${projects[0].projectId}`, {
    headers: { 'X-CSRF-Token': session.csrfToken },
    data: {
      expectedVersion: 1,
      fields: { organization: 'Серверная организация' },
      title: 'Серверное название',
    },
  })
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Серверное название')
  await expect(title).toHaveValue('Мои изменения')
  await page.getByRole('button', { name: 'Оставить мои правки для сохранения' }).click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.locator('.docs-editor-head')).toContainText('Версия 3')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('real suggestions remain proposals until accepted and allow a manual revision', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Документы', exact: true }).click()
  await page.locator('.docs-card').first().getByRole('button', { name: 'Создать проект' }).click()
  const projects = await (await page.request.get('/api/document-projects')).json()
  const id = projects[0].projectId
  const session = await (await page.request.get('/api/session')).json()
  const proposal = await page.request.post(`/api/document-projects/${id}/operations`, {
    headers: { 'X-CSRF-Token': session.csrfToken },
    data: {
      operation: 'propose_rewrite',
      document_id: id,
      base_version: 1,
      block_id: 'field:purpose',
      value: 'Предложенная цель',
      reason: 'Пользовательский вариант',
    },
  })
  expect(proposal.ok()).toBe(true)
  await page.getByRole('button', { name: 'Помощник', exact: true }).click()
  await expect(page.getByLabel('Предлагаемый текст')).toHaveValue('Предложенная цель')
  const before = await (await page.request.get(`/api/document-projects/${id}`)).json()
  expect(before.fields.purpose).toBeUndefined()
  await page.getByLabel('Предлагаемый текст').fill('Цель, уточнённая пользователем')
  await page.getByRole('button', { name: 'Принять', exact: true }).click()
  await expect(page.locator('.docs-editor-head')).toContainText('Версия 2')
  const after = await (await page.request.get(`/api/document-projects/${id}`)).json()
  expect(after.fields.purpose).toBe('Цель, уточнённая пользователем')
  await expect(page.getByRole('heading', { name: 'Предложений нет' })).toBeVisible()
})
