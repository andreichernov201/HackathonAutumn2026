import { expect, test } from '@playwright/test'

for (const index of [0, 4]) {
  test(`live DOCX marks only form fields, including tables: module ${index}`, async ({page}, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('button', {name: 'Документы', exact: true}).click()
    await page.locator('.docs-card').nth(index).getByRole('button', {name: 'Создать проект'}).click()
    const preview = page.locator('.docs-live-preview')
    const frame = preview.frameLocator('iframe[title="Страницы DOCX"]')
    await expect(frame.getByText('Укажите: Наименование организации', {exact: true})).toHaveCSS('background-color', 'rgb(254, 243, 199)', {timeout: 30000})
    await expect(preview.getByLabel('Обозначения полей')).toContainText('Не заполнено')
    await expect(preview.getByRole('button', {name: 'Скачать DOCX'})).toHaveCount(0)
    await page.getByRole('textbox', {name: /^Наименование организации/}).fill('Организация для проверки')
    await expect(frame.getByText('Организация для проверки', {exact: true})).toHaveCSS('background-color', 'rgb(219, 234, 254)')
    await expect(frame.getByText('Укажите: Наименование организации', {exact: true})).toHaveCount(0)
    if (index === 0) {
      await page.getByRole('textbox', {name: /^Руководитель:/}).fill('Руководитель Иванов')
      await expect(frame.locator('td').getByText('Руководитель Иванов', {exact: true})).toHaveCSS('background-color', 'rgb(219, 234, 254)')
    } else {
      await page.getByRole('textbox', {name: /^Назначаемые:/}).fill('Отдел А | Иванов\nОтдел Б | Петров')
      await expect(frame.locator('td').getByText('Петров', {exact: true})).toHaveCSS('background-color', 'rgb(219, 234, 254)')
    }
    const heading = frame.locator('p').filter({hasText: /^(РАСПОРЯЖЕНИЕ|ПРИКАЗ)$/})
    await expect(heading).toHaveCount(1)
    expect(await heading.locator('[style*="background-color"]').count()).toBe(0)
    await preview.getByRole('textbox', {name: 'Поиск в DOCX'}).fill('Организация для проверки')
    await preview.getByRole('button', {name: 'Найти', exact: true}).click()
    await expect(frame.locator('mark.dv-highlight')).toHaveCount(1)
    await preview.getByRole('textbox', {name: 'Поиск в DOCX'}).fill('')
    await expect(frame.getByText('Организация для проверки', {exact: true})).toHaveCSS('background-color', 'rgb(219, 234, 254)')
    await page.getByRole('textbox', {name: /^Наименование организации/}).fill('')
    await expect(frame.getByText('Укажите: Наименование организации', {exact: true})).toHaveCSS('background-color', 'rgb(254, 243, 199)')
    await page.screenshot({path: testInfo.outputPath(`preview-module-${index}.png`), fullPage: false})
    expect(errors).toEqual([])
  })
}

test('a delayed preview cannot replace newer unsaved values', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button', {name: 'Документы', exact: true}).click()
  await page.locator('.docs-card').first().getByRole('button', {name: 'Создать проект'}).click()
  const preview = page.locator('.docs-live-preview')
  const frame = preview.frameLocator('iframe[title="Страницы DOCX"]')
  await expect(frame.getByText('Укажите: Наименование организации', {exact: true})).toBeVisible({timeout: 30000})
  const field = page.getByRole('textbox', {name: /^Наименование организации/})
  let release!: () => void, reached!: () => void
  const gate = new Promise<void>(resolve => {release = resolve})
  const started = new Promise<void>(resolve => {reached = resolve})
  await page.route('**/api/document-projects/*/preview-file', async route => {
    if (route.request().postDataJSON().fields.organization !== 'Старое значение') return route.continue()
    const response = await route.fetch()
    reached()
    await gate
    await route.fulfill({response}).catch(() => {})
  })
  await field.fill('Старое значение')
  await started
  await field.fill('Новое значение')
  await expect(frame.getByText('Новое значение', {exact: true})).toBeVisible()
  release()
  await expect(preview.getByRole('status').first()).toHaveText('Предпросмотр текущих значений')
  await expect(frame.getByText('Старое значение', {exact: true})).toHaveCount(0)
  await expect(field).toHaveValue('Новое значение')
  await expect(page.locator('.docs-editor-head')).toContainText('версия 1')
  await expect(page.locator('.docs-versions')).toHaveCount(0)
})
