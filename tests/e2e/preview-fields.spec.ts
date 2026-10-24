import { expect, test } from '@playwright/test'

for (const index of [0, 4]) {
  test(`inline DOCX fields and table fields edit without changing protected content: module ${index}`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('button', { name: 'Документы', exact: true }).click()
    await page.locator('.docs-card').nth(index).getByRole('button', { name: 'Создать проект' }).click()
    const preview = page.locator('.docs-live-preview')
    const frame = preview.frameLocator('iframe[title="Страницы DOCX"]')
    const organization = frame.locator('[data-field-id="organization"]').first()
    await expect(organization).toHaveAttribute('contenteditable', 'plaintext-only', { timeout: 30000 })
    await expect(organization).toHaveAttribute('aria-invalid', 'true')
    await organization.fill('Организация для проверки')
    await organization.press('Tab')
    await expect(frame.getByText('Организация для проверки', { exact: true })).toBeVisible()
    await expect(page.locator('.docs-editor-head')).toContainText('несохранённые изменения')
    const key = index === 0 ? 'chair' : 'appointees'
    await page.locator(`.inspector-field-list [data-field-key="${key}"]`).click()
    await page
      .locator('.field-editor')
      .locator('input,textarea')
      .fill(index === 0 ? 'Руководитель Иванов' : 'Отдел А | Иванов\nОтдел Б | Петров')
    await expect(
      frame.locator('td').getByText(index === 0 ? 'Руководитель Иванов' : 'Петров', {
        exact: true,
      }),
    ).toBeVisible()
    const heading = frame.locator('p').filter({ hasText: /^(РАСПОРЯЖЕНИЕ|ПРИКАЗ)$/ })
    await expect(heading).toHaveCount(1)
    expect(await heading.locator('[contenteditable]').count()).toBe(0)
    await preview.getByRole('button', { name: 'Поиск по документу', exact: true }).click()
    await preview.getByRole('textbox', { name: 'Поиск в DOCX' }).fill('Организация для проверки')
    await preview.getByRole('button', { name: 'Найти', exact: true }).click()
    await expect(frame.locator('mark.dv-highlight')).toHaveCount(1)
    await preview.getByRole('textbox', { name: 'Поиск в DOCX' }).fill('')
    await page.locator('.inspector-field-list [data-field-key="organization"]').click()
    await page.locator('.field-editor input').fill('')
    await expect(frame.locator('[data-field-id="organization"]').first()).toHaveAttribute('aria-invalid', 'true')
    await page.screenshot({
      path: testInfo.outputPath(`preview-module-${index}.png`),
    })
    expect(errors).toEqual([])
  })
}

test('a delayed preview cannot replace newer unsaved values', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Документы', exact: true }).click()
  await page.locator('.docs-card').first().getByRole('button', { name: 'Создать проект' }).click()
  const preview = page.locator('.docs-live-preview'),
    frame = preview.frameLocator('iframe[title="Страницы DOCX"]')
  await expect(frame.locator('[data-field-id="organization"]').first()).toBeVisible({ timeout: 30000 })
  await page.locator('.inspector-field-list [data-field-key="organization"]').click()
  const field = page.locator('.field-editor input')
  let release!: () => void, reached!: () => void
  const gate = new Promise<void>((resolve) => {
      release = resolve
    }),
    started = new Promise<void>((resolve) => {
      reached = resolve
    })
  await page.route('**/api/document-projects/*/preview-file', async (route) => {
    if (route.request().postDataJSON().fields.organization !== 'Старое значение') return route.continue()
    const response = await route.fetch()
    reached()
    await gate
    await route.fulfill({ response }).catch(() => {})
  })
  await field.fill('Старое значение')
  await started
  await field.fill('Новое значение')
  await expect(frame.getByText('Новое значение', { exact: true })).toBeVisible()
  release()
  await expect(preview.getByRole('status').first()).toContainText('Поля выделены синим')
  await expect(frame.getByText('Старое значение', { exact: true })).toHaveCount(0)
  await expect(field).toHaveValue('Новое значение')
  await expect(page.locator('.docs-editor-head')).toContainText('Версия 1')
})
