import path from "node:path"
import { expect, test } from "@playwright/test"
import type { SessionSnapshot } from "../../src/bridge/types"

test.use({
  launchOptions: process.env.OPENCODE_UI_CHROMIUM_PATH
    ? { executablePath: process.env.OPENCODE_UI_CHROMIUM_PATH }
    : {},
})

const ref = { workspaceId: "file:///workspace", dir: "/workspace", sessionId: "session-1" }
const snapshot: SessionSnapshot = {
  status: "ready",
  sessionRef: ref,
  workspaceName: "workspace",
  session: { id: ref.sessionId, directory: ref.dir, title: "Editing test", time: { created: 1, updated: 1 } },
  display: { showInternals: false, showThinking: true, diffMode: "unified", panelTheme: "classic" },
  messages: [{
    info: { id: "message-1", sessionID: ref.sessionId, role: "assistant", time: { created: 1 } },
    parts: [{ id: "part-1", messageID: "message-1", sessionID: ref.sessionId, type: "text", text: "Select any part of this output.\n\n第二段也可以自由复制。" }],
  }],
  childMessages: {}, childSessions: {}, submitting: false, todos: [], diff: [], permissions: [], questions: [],
  agents: [], providers: [], mcp: {}, mcpResources: {}, lsp: [], commands: [], relatedSessionIds: [], agentMode: "build", navigation: {},
}

test.beforeEach(async ({ page }) => {
  await page.setContent('<html><body><div id="root"></div></body></html>')
  await page.evaluate((sessionRef) => {
    Object.assign(window, {
      __OPENCODE_INITIAL_STATE__: { sessionRef },
      postedMessages: [],
      acquireVsCodeApi: () => ({
        getState: () => undefined,
        setState: () => {},
        postMessage: (message: unknown) => {
          const state = window as unknown as { postedMessages: unknown[] }
          state.postedMessages.push(message)
        },
      }),
    })
  }, ref)
  await page.addStyleTag({ path: path.resolve("dist/panel-webview.css") })
  await page.addScriptTag({ path: path.resolve("dist/panel-webview.js") })
  await page.waitForFunction(() => (window as unknown as { postedMessages: Array<{ type: string }> }).postedMessages.some((message) => message.type === "ready"))
  await page.evaluate((payload) => window.dispatchEvent(new MessageEvent("message", { data: { type: "snapshot", payload } })), snapshot)
  await expect(page.locator(".oc-composerInput")).toHaveAttribute("contenteditable", "true")
})

test("undoes and redoes typing without changing the session", async ({ page }) => {
  const input = page.locator(".oc-composerInput")
  await input.fill("hello")
  await input.press("Control+z")
  await expect(input).toHaveText("")
  await input.press("Control+Shift+z")
  await expect(input).toHaveText("hello")
  await input.press("Control+z")
  await input.press("Control+y")
  await expect(input).toHaveText("hello")
  const actions = await page.evaluate(() => (window as unknown as { postedMessages: Array<{ type: string }> }).postedMessages.filter((message) => message.type === "composerAction"))
  expect(actions).toEqual([])
})

test("keeps consecutive typing edits and clears history when switching sessions", async ({ page }) => {
  const input = page.locator(".oc-composerInput")
  await input.pressSequentially("abc")
  await expect(input).toHaveText("abc")
  await input.press("Control+z")
  await expect(input).toHaveText("ab")
  await input.press("Meta+z")
  await expect(input).toHaveText("a")
  await input.press("Meta+Shift+z")
  await expect(input).toHaveText("ab")
  await page.evaluate((payload) => window.dispatchEvent(new MessageEvent("message", { data: { type: "snapshot", payload } })), {
    ...snapshot,
    sessionRef: { ...ref, sessionId: "session-2" },
    session: { ...snapshot.session!, id: "session-2", title: "Second editing session" },
  })
  await expect(page).toHaveTitle("OpenCode: Second editing session")
  await input.press("Control+z")
  await expect(input).toHaveText("ab")
})

test("undoes paste, multiline insertion, and selection replacement", async ({ page }) => {
  const input = page.locator(".oc-composerInput")
  await input.fill("original")
  await input.press("End")
  await input.evaluate((element) => {
    const clipboardData = new DataTransfer()
    clipboardData.setData("text/plain", " pasted\r\n第二行")
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }))
  })
  await expect(input).toHaveText("original pasted第二行")
  await input.press("Control+z")
  await expect(input).toHaveText("original")
  await input.press("Control+Shift+z")
  await expect(input).toHaveText("original pasted第二行")
  await input.press("Control+z")
  await input.press("Shift+Enter")
  await input.press("Control+z")
  await expect(input).toHaveText("original")
  await input.press("Control+a")
  await input.press("Backspace")
  await expect(input).toHaveText("")
  await input.press("Control+z")
  await expect(input).toHaveText("original")
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("original")
})

test("restores deleted file references and their line ranges", async ({ page }) => {
  await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", {
    data: { type: "restoreComposer", parts: [{ type: "file", path: "src/app.ts", selection: { startLine: 2, endLine: 5 }, source: { value: "@src/app.ts#2-5", start: 0, end: 14 } }] },
  })))
  const input = page.locator(".oc-composerInput")
  const pill = input.locator(".oc-composerPill")
  await expect(pill).toHaveAttribute("data-path", "src/app.ts")
  await input.press("Control+a")
  await input.press("Backspace")
  await expect(pill).toHaveCount(0)
  await input.press("Control+z")
  await expect(pill).toHaveAttribute("data-path", "src/app.ts")
  await expect(pill).toHaveAttribute("data-start-line", "2")
  await expect(pill).toHaveAttribute("data-end-line", "5")
})

test("copies arbitrary transcript selections with shortcuts, Copy events, and context data", async ({ page }) => {
  const paragraph = page.locator(".oc-transcript p").first()
  await paragraph.evaluate((element) => {
    const range = document.createRange()
    range.setStart(element.firstChild!, 7)
    range.setEnd(element.firstChild!, 23)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
  })
  await page.keyboard.press("Control+c")
  await paragraph.dispatchEvent("copy")
  await paragraph.dispatchEvent("contextmenu")
  const copied = await page.evaluate(() => (window as unknown as { postedMessages: Array<{ type: string; text?: string }> }).postedMessages.filter((message) => message.type === "copyText"))
  expect(copied).toEqual([{ type: "copyText", text: "any part of this" }, { type: "copyText", text: "any part of this" }])
  const context = JSON.parse(await page.locator(".oc-transcript").getAttribute("data-vscode-context") ?? "{}")
  expect(context.opencodeSelectedText).toBe("any part of this")
  expect(context.opencodeHasSelection).toBe(true)
  expect(context.preventDefaultContextMenuItems).toBe(true)
})

test("cuts selected input with Ctrl+X, pastes the text, and supports undo", async ({ page }) => {
  const input = page.locator(".oc-composerInput")
  await input.fill("keep selected text")
  await input.evaluate((element) => {
    const range = document.createRange()
    range.setStart(element.firstChild!, 5)
    range.setEnd(element.firstChild!, 18)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
  })
  await input.press("Control+x")
  await expect(input).toHaveText("keep ")
  await expect(page.locator(".oc-composerLeaderOverlay")).toHaveCount(0)
  await input.press("Control+z")
  await expect(input).toHaveText("keep selected text")
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("selected text")
  await page.evaluate(() => {
    const target = document.createElement("textarea")
    target.id = "paste-target"
    document.body.appendChild(target)
    target.focus()
  })
  await page.locator("#paste-target").press("Control+v")
  await expect(page.locator("#paste-target")).toHaveValue("selected text")
})

test("keeps the Ctrl+X leader shortcut when the input has no selection", async ({ page }) => {
  const input = page.locator(".oc-composerInput")
  await input.fill("keep this draft")
  await input.press("End")
  await input.press("Control+x")
  await expect(page.locator(".oc-composerLeaderOverlay")).toBeVisible()
  await expect(input).toHaveText("keep this draft")
})

test("can undo cutting a file reference with its line range", async ({ page }) => {
  await page.evaluate(() => window.dispatchEvent(new MessageEvent("message", {
    data: { type: "restoreComposer", parts: [{ type: "file", path: "src/app.ts", selection: { startLine: 2, endLine: 5 }, source: { value: "@src/app.ts#2-5", start: 0, end: 14 } }] },
  })))
  const input = page.locator(".oc-composerInput")
  await expect(input.locator(".oc-composerPill")).toHaveCount(1)
  await input.press("Control+a")
  await input.press("Control+x")
  await expect(input.locator(".oc-composerPill")).toHaveCount(0)
  await input.press("Control+z")
  await expect(input.locator(".oc-composerPill")).toHaveAttribute("data-path", "src/app.ts")
  await expect(input.locator(".oc-composerPill")).toHaveAttribute("data-start-line", "2")
  await expect(input.locator(".oc-composerPill")).toHaveAttribute("data-end-line", "5")
})
