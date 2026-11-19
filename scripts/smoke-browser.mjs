import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "playwright"
import { root } from "./common.mjs"

const output = path.join(root, "test-results")
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true, args: ["--no-sandbox"] })
const context = await browser.newContext({ viewport: { width: 1720, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on("pageerror", error => errors.push(error.message))

async function command(title, opensPicker = false) {
  await page.waitForTimeout(800)
  await page.keyboard.press("Escape")
  await page.locator(".titlebar").click({ position: { x: 350, y: 12 } })
  await page.keyboard.press("F1")
  const input = page.locator(".quick-input-widget input")
  await input.waitFor({ state: "visible" })
  await input.click()
  await page.keyboard.press("Control+A")
  await page.keyboard.insertText(`>${title}`)
  await page.locator(".quick-input-list .monaco-list-row").filter({ hasText: title }).first().waitFor({ state: "visible", timeout: 15000 })
  await page.locator(".quick-input-list .monaco-list-row").filter({ hasText: title }).first().click()
  if (!opensPicker) await input.waitFor({ state: "hidden" })
  await page.waitForTimeout(800)
}

try {
  await page.goto(process.env.OPENCODE_IDE_URL || `http://127.0.0.1:3100/?folder=${encodeURIComponent(path.join(root, "examples/latex-demo"))}`)
  const login = page.locator('form[action="/login"]')
  if (await login.isVisible({ timeout: 3000 }).catch(() => false)) {
    if (!process.env.OPENCODE_IDE_USERNAME || !process.env.OPENCODE_IDE_PASSWORD) throw new Error("Set OPENCODE_IDE_USERNAME and OPENCODE_IDE_PASSWORD for the authenticated browser test")
    await login.locator('[name="username"]').fill(process.env.OPENCODE_IDE_USERNAME)
    await login.locator('[name="password"]').fill(process.env.OPENCODE_IDE_PASSWORD)
    await login.getByRole("button", { name: /登录|sign in/i }).click()
  }
  await page.locator(".monaco-workbench").waitFor({ timeout: 60000 })
  if (page.url().includes("/login")) await page.waitForURL(url => !url.pathname.includes("/login"), { timeout: 15000 })
  const trust = page.getByRole("button", { name: /Yes, I trust|是，我信任/ })
  if (await trust.isVisible({ timeout: 3000 }).catch(() => false)) await trust.click()
  await page.getByText("main.tex", { exact: true }).first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(5000)
  if (await page.getByText(/Restricted Mode is intended for safe code browsing/).isVisible().catch(() => false)) {
    await command("Workspaces: Manage Workspace Trust")
    await page.getByText(/You trust this (folder|workspace)|You are in Restricted Mode/, { exact: true }).waitFor()
    const grantTrust = page.getByRole("button", { name: "Trust", exact: true })
    if (await grantTrust.isVisible()) await grantTrust.click()
    const confirm = page.getByRole("button", { name: /Trust Folder|Trust Workspace|Yes, I trust/ })
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
  }
  if (process.env.OPENCODE_IDE_EXPECT_AUTO_LAYOUT !== "1") await command("OpenCode IDE: Restore Default Layout")
  await page.getByText("main.tex", { exact: true }).first().waitFor({ timeout: 60000 })
  await page.locator(".editor-group-container").first().waitFor({ timeout: 60000 })
  assert.equal(await page.locator(".editor-group-container").count(), 1)
  assert.equal(await page.locator(".editor-group-container").count(), 1, "Result group stays closed until a result is selected")
  await page.locator('[id="workbench.parts.auxiliarybar"]').waitFor({ state: "visible" })
  assert.equal(await page.locator('[id="workbench.parts.sidebar"]').isVisible(), false, "Primary sidebar is hidden by default")
  await page.locator('[id="workbench.parts.panel"]').waitFor({ state: "visible" })
  await page.locator(".editor-group-container").first().getByRole("tab", { name: /main.tex/ }).click()
  await command("File: Revert File")
  await command("OpenCode IDE: Open in Result Group", true)
  await page.locator(".quick-input-widget input").waitFor({ state: "visible" })
  await page.keyboard.press("Escape")
  await page.locator(".editor-group-container").first().getByRole("tab", { name: /main.tex/ }).click()
  await page.waitForFunction(() => {
    const frames = [...document.querySelectorAll('iframe')]
    return frames.length >= 2
  })
  const agentFrame = async () => {
    for (const frame of page.frames()) {
      if (await frame.locator(".oc-composerInput").count()) return frame
    }
    return undefined
  }
  let agent
  for (let attempt = 0; attempt < 30 && !agent; attempt++) {
    agent = await agentFrame()
    if (!agent) await page.waitForTimeout(500)
  }
  assert.ok(agent, "Original OpenCode composer must render inside the right Webview")
  await agent.getByText("Connecting to workspace", { exact: true }).waitFor({ state: "hidden", timeout: 30000 })
  const assertChatLayout = async () => {
    assert.equal(await page.locator('[id="workbench.parts.auxiliarybar"] .chat-viewpane').count(), 0, "Native Chat must be absent")
    assert.equal(await page.locator('.editor-group-container [role="tab"]').filter({ hasText: /OpenCode|New session/ }).count(), 0, "OpenCode must not open editor tabs")
    const currentAgent = await agentFrame()
    assert.ok(currentAgent, "OpenCode conversation must be available")
    const composerBox = await currentAgent.locator(".oc-composerInput").boundingBox()
    const sidebarBox = await page.locator('[id="workbench.parts.auxiliarybar"]').boundingBox()
    assert.ok(composerBox && sidebarBox && composerBox.x >= sidebarBox.x, "OpenCode composer must be inside the right sidebar")
    assert.equal(await page.locator(".editor-group-container").count(), 1)
  }
  await assertChatLayout()
  await command("OpenCode: New Session")
  await assertChatLayout()
  await page.locator(".editor-group-container").first().getByRole("tab", { name: /main.tex/ }).click()
  await command("OpenCode: Ask About Current File")
  await page.waitForFunction(() => [...document.querySelectorAll('iframe')].length >= 2)
  agent = await agentFrame()
  await agent.locator(".oc-composerInput").filter({ hasText: /main.tex/ }).waitFor({ timeout: 30000 })
  await assertChatLayout()
  await page.screenshot({ path: path.join(output, "phase2-workbench.png") })
  const groupsBefore = await page.locator(".editor-group-container").evaluateAll(groups => groups.map(group => ({ width: group.getBoundingClientRect().width, text: group.textContent?.slice(0, 150) })))
  await page.waitForTimeout(6000)
  await page.reload()
  await page.locator(".editor-group-container").first().waitFor({ timeout: 60000 })
  await page.getByText("main.tex", { exact: true }).first().waitFor({ timeout: 60000 })
  assert.equal(await page.locator(".editor-group-container").count(), 1)
  await page.locator('[id="workbench.parts.auxiliarybar"]').waitFor({ state: "visible" })
  agent = await agentFrame()
  for (let attempt = 0; attempt < 60 && !agent; attempt++) {
    await page.waitForTimeout(500)
    agent = await agentFrame()
  }
  assert.ok(agent, "OpenCode sidebar composer is restored after reload")
  await agent.getByText("Connecting to workspace", { exact: true }).waitFor({ state: "hidden", timeout: 30000 })
  await assertChatLayout()
  const groupsAfter = await page.locator(".editor-group-container").evaluateAll(groups => groups.map(group => ({ width: group.getBoundingClientRect().width, text: group.textContent?.slice(0, 150) })))
  assert.equal(groupsAfter.length, 1, "Result group stays closed after reload unless opened explicitly")
  await page.screenshot({ path: path.join(output, "phase2-restored.png") })
  const report = { url: page.url(), groupsBefore, groupsAfter, pageErrors: errors, checks: ["authenticated workbench", "single editor group", "results closed by default", "original Agent composer and ready session", "native Chat removed", "new session stays in right sidebar", "file context seeded in right sidebar", "reload persistence"] }
  if (process.env.OPENCODE_IDE_TEST_PDF === "1") {
    await command("OpenCode IDE: Files")
    await command("OpenCode IDE: Open in Result Group", true)
    const pathInput = page.locator(".quick-input-widget input")
    await pathInput.waitFor({ state: "visible" })
    await pathInput.fill(path.join(root, "examples/latex-demo/main.pdf"))
    await page.keyboard.press("Enter")
    await page.locator(".editor-group-container").first().getByRole("tab", { name: /main.pdf/ }).waitFor({ timeout: 30000 })
    assert.equal(await page.locator(".editor-group-container").count(), 1)
    await page.waitForTimeout(5000)
    await page.screenshot({ path: path.join(output, "phase2-pdf.png") })
    report.checks.push("selected PDF opens in current editor group (rendering not asserted)")
  }
  await writeFile(path.join(output, "phase2-browser.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  await page.screenshot({ path: path.join(output, "phase2-failure.png") }).catch(() => {})
  await writeFile(path.join(output, "phase2-failure.txt"), `${String(error)}\n${await page.locator("body").innerText().catch(() => "")}\n${JSON.stringify(errors)}`)
  throw error
} finally {
  await browser.close()
}
