import assert from "node:assert/strict"
import { pathToFileURL } from "node:url"
import path from "node:path"
import { chromium } from "playwright"

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] })
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } })
  const errors = []
  const network = []
  page.on("pageerror", e => errors.push(e.message))
  page.on("request", r => { if (/^https?:/.test(r.url())) network.push(r.url()) })
  await page.goto(pathToFileURL(path.resolve("reference/prototype.html")).href)
  assert.equal(await page.locator('[role="tab"]').count(), 5)
  assert.equal(await page.locator('#resultPane').isVisible(), false)
  for (const name of ["OpenCode", "Sessions", "Todo", "Subagents", "Modified Files"]) {
    await page.getByRole('tab', { name, exact: true }).click()
    assert.equal(await page.getByRole('tabpanel', { name, exact: true }).isVisible(), true)
  }
  await page.getByRole('button', { name: 'Quick New Session', exact: true }).click()
  await page.getByLabel('演示聊天输入').fill('<script>unsafe</script>')
  await page.getByRole('button', { name: '发送演示消息' }).click()
  assert.ok((await page.locator('#messages').innerText()).includes('<script>unsafe</script>'))
  await page.getByRole('button', { name: 'OpenCode Settings', exact: true }).click()
  assert.equal(await page.locator('#settingsPane').isVisible(), true)
  assert.equal(await page.getByRole('tab', { name: 'Settings', exact: true }).count(), 0)
  await page.getByRole('button', { name: '返回源码' }).click()
  await page.getByRole('button', { name: '打开演示结果' }).click()
  assert.equal(await page.locator('#resultPane').isVisible(), true)
  await page.getByRole('button', { name: '返回源码' }).click()
  await page.setViewportSize({ width: 720, height: 800 })
  assert.equal(await page.getByRole('button', { name: 'OpenCode Settings', exact: true }).isVisible(), true)
  assert.deepEqual(errors, [])
  assert.deepEqual(network, [])
  console.log("Prototype passed: five tabs, settings, new session, result on demand, no network or JS errors")
} finally { await browser.close() }
