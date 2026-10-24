import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const pdf = resolve('api/knowledge/sources/records-instruction.pdf')
const docx = resolve('api/templates/sources/working-group-order.docx')
// Trace snapshotting injects scripts into srcdoc, which the viewer correctly blocks.
// Test the application's console without this extra instrumentation.
test.use({trace: 'off'})

test('local PDF → DOCX → PDF, text selection, original bytes, resize and honest review status', async ({page}, testInfo) => {
  test.setTimeout(90000)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const consoleErrors: string[] = []
  page.on('console', message => {if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) consoleErrors.push(message.text() + ' ' + message.location().url)})
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  if (process.env.REGULA_TEST_CSP === '1') {
    const caddy = await readFile(resolve('deploy/Caddyfile'), 'utf8')
    const policy = caddy.match(/Content-Security-Policy "([^"]+)"/)![1]
    await page.route('**/*', async route => {
      if (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()) {
        const response = await route.fetch()
        await route.fulfill({response, headers: {...response.headers(), 'content-security-policy': policy}})
      } else await route.continue()
    })
  }
  await page.goto('/')
  await page.getByRole('button', {name: 'Проверка', exact: true}).click()
  const input = page.getByLabel('Документ для просмотра')
  await input.setInputFiles(pdf)
  const viewer = page.getByRole('region', {name: 'Просмотр PDF'})
  await expect(viewer.getByRole('button', {name: 'Следующая страница PDF'})).toBeEnabled({timeout: 30000})
  await expect(viewer.locator('canvas').first()).toBeVisible()
  expect(await viewer.locator('canvas').count()).toBeLessThan(8)
  await viewer.locator('.textLayer span').first().evaluate(node => {const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range)})
  const selected = await page.evaluate(() => window.getSelection()?.toString() || '')
  expect(selected.length).toBeGreaterThan(0)
  await page.keyboard.press('ControlOrMeta+C')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(selected)
  const downloadEvent = page.waitForEvent('download')
  await viewer.getByRole('button', {name: 'Скачать оригинал'}).click()
  const download = await downloadEvent
  expect(await readFile((await download.path())!)).toEqual(await readFile(pdf))
  await page.getByRole('button', {name: 'Скрыть: Замечания'}).click()
  await expect(page.getByRole('button', {name: 'Показать: Замечания'})).toBeVisible()
  await input.setInputFiles(docx)
  const word = page.getByRole('region', {name: 'Просмотр DOCX'})
  await expect(word.getByRole('button', {name: 'Следующая страница DOCX'})).toBeEnabled({timeout: 30000})
  const frame = page.frameLocator('iframe[title="Страницы DOCX"]')
  await expect(frame.locator('table').first()).toBeVisible()
  await expect(frame.locator('body')).toContainText('РАСПОРЯЖЕНИЕ')
  await expect(frame.locator('body')).toContainText('Руководитель')
  await expect(frame.locator('body')).toContainText('МОДУЛЬНЫЙ ДОКУМЕНТ')
  await word.getByRole('button', {name: 'Сбросить масштаб'}).click()
  await expect(word.getByLabel('Масштаб DOCX')).toHaveText('100%')
  await word.getByRole('textbox', {name: 'Поиск в DOCX'}).fill('Руководитель')
  await word.getByRole('button', {name: 'Найти', exact: true}).click()
  await expect(frame.locator('mark.dv-highlight').first()).toBeVisible()
  const wordDownload = page.waitForEvent('download'); await word.getByRole('button', {name: 'Скачать оригинал'}).click()
  expect(await readFile((await (await wordDownload).path())!)).toEqual(await readFile(docx))
  await page.screenshot({path: testInfo.outputPath('docx-viewer.png')})
  await page.setViewportSize({width: 700, height: 1000})
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await input.setInputFiles(pdf)
  await expect(viewer.getByRole('button', {name: 'Следующая страница PDF'})).toBeEnabled({timeout: 30000})
  await expect(page.locator('iframe[title="Страницы DOCX"]')).toHaveCount(0)
  await input.setInputFiles({name: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('broken')})
  await expect(page.getByRole('alert')).toContainText('повреждён')
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
})
