import { chromium } from "playwright"
import assert from "node:assert/strict"
import { mkdir } from "node:fs/promises"
if (!process.env.OPENCODE_IDE_URL || !process.env.OPENCODE_IDE_USERNAME || !process.env.OPENCODE_IDE_PASSWORD) throw new Error("Set OPENCODE_IDE_URL, OPENCODE_IDE_USERNAME and OPENCODE_IDE_PASSWORD for this browser test")
await mkdir("test-results", { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage({ viewport: { width: 1720, height: 1000 } })
try {
  await page.goto(process.env.OPENCODE_IDE_URL)
  await page.locator('[name="username"]').fill(process.env.OPENCODE_IDE_USERNAME)
  await page.locator('[name="password"]').fill(process.env.OPENCODE_IDE_PASSWORD)
  await page.getByRole("button", { name: "登录", exact: true }).click()
  await page.locator(".monaco-workbench").waitFor({ timeout: 60000 })
  await page.waitForTimeout(8000)
  assert.equal(await page.locator('[id="workbench.parts.activitybar"] [role="button"][aria-label="Accounts"]').count(), 0, "Accounts entry must be hidden")
  const sidebar = page.locator('[id="workbench.parts.auxiliarybar"]')
  const box = await sidebar.boundingBox()
  await page.mouse.move(box.x - 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(850, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  for (const label of ["OpenCode", "Sessions", "Todo", "Subagents", "Modified Files"]) {
    const tab = sidebar.locator('[role="tab"]').filter({ hasText: new RegExp(`^${label}$`) })
    await tab.click()
    assert.equal(await tab.getAttribute("aria-selected"), "true")
    await page.mouse.move(400, 300)
    await sidebar.getByRole('button', { name: /OpenCode: Quick New Session/ }).waitFor({ state: 'visible' })
  }
  assert.equal(await page.locator('[id="workbench.parts.editor"]').getByRole('button', { name: /OpenCode: Quick New Session/ }).count(), 0)
  await page.screenshot({ path: "test-results/tabs-initial.png" })
  const gear = page.locator('[id="workbench.parts.activitybar"] [aria-label="Manage"][role="button"]')
  await gear.click()
  await page.waitForTimeout(700)
  const menu = await page.locator('.context-view').innerText()
  assert.ok(menu.includes("Settings"))
  assert.ok(!/chat|copilot/i.test(menu), "Manage menu must not expose native Chat")
  await page.screenshot({ path: "test-results/tabs-menu.png" })
  await page.keyboard.press("Escape")
  await sidebar.locator('[role="tab"]').filter({ hasText: /^OpenCode$/ }).click()
  await page.mouse.move(400, 300)
  const settingsGear = sidebar.getByRole('button', { name: /OpenCode: Open Settings/ })
  await settingsGear.waitFor({ state: 'visible' })
  assert.equal(await settingsGear.evaluate(e => getComputedStyle(e).opacity), '1')
  await settingsGear.click()
  let frame
  for (let i=0;i<60;i++) {
    frame = page.frames().find(f => f.url().includes("vscode-webview"))
    for (const f of page.frames()) if (await f.locator("#settings").count()) frame = f
    if (frame && await frame.locator("#settings").count()) break
    await page.waitForTimeout(500)
  }
  assert.ok(frame && await frame.locator("#settings").count(), "Settings form renders")
  await frame.waitForFunction(() => document.querySelector('#providers').children.length > 0)
  assert.equal(await frame.locator('#apiKey').inputValue(), "", "Existing API keys must never be returned to the form")
  assert.equal(await sidebar.locator('[role="tab"]').filter({ hasText: /^Settings$/ }).count(), 0)
  console.log("Passed: Accounts hidden, five tabs, persistent settings gear, no Settings sidebar tab, settings form loading")
  await page.screenshot({ path: "test-results/tabs-settings.png" })
} catch (error) {
  await page.screenshot({ path: "test-results/tabs-failure.png" })
  console.log(await page.locator('[id="workbench.parts.auxiliarybar"]').innerText())
  throw error
} finally { await browser.close() }
