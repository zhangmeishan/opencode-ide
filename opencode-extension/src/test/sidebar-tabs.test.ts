import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"

test("each OpenCode module has its own right sidebar tab", () => {
  const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"))
  const containers = manifest.contributes.viewsContainers
  assert.equal(containers.activitybar, undefined)
  assert.deepEqual(containers.secondarySidebar.map((item: { title: string }) => item.title), ["OpenCode", "Sessions", "Todo", "Subagents", "Modified Files"])
  for (const item of containers.secondarySidebar) assert.equal(manifest.contributes.views[item.id].length, 1)
  assert.ok(manifest.contributes.menus["view/title"].some((item: { command: string; when: string }) => item.command === "opencode-ide-chat.openSettings" && item.when.includes("opencode-ide-chat.sessionView")))
  assert.equal(containers.secondarySidebar.some((item: { title: string }) => item.title === "Settings"), false)
})

test("quick new session is available on every OpenCode sidebar module, never the editor title", () => {
  const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"))
  const menus = manifest.contributes.menus
  assert.equal((menus["editor/title"] || []).some((item: { command: string }) => item.command === "opencode-ide-chat.quickNewSession"), false)
  const action = menus["view/title"].find((item: { command: string }) => item.command === "opencode-ide-chat.quickNewSession")
  assert.ok(action)
  for (const view of ["sessionView", "sessions", "todo", "subagents", "diff"]) assert.ok(action.when.includes(`view == opencode-ide-chat.${view}`))
})
