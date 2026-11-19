import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { deleteSession, type SessionActionTarget } from "../core/commands"

const target: SessionActionTarget = {
  runtime: { workspaceId: "file:///workspace-a", dir: "/workspace-a", name: "workspace-a", state: "ready", sdk: { session: {} } },
  session: { id: "session-1", directory: "/workspace-a", title: "Delete me", time: { created: 1, updated: 1 } },
}

test("confirms permanent deletion, deletes in the selected workspace, then closes the tab", async () => {
  const calls: unknown[] = []
  await deleteSession({
    target,
    sessions: { delete: async (...args) => { calls.push(args); return true } },
    closeSession: async () => { calls.push("closed") },
    showWarningMessage: async (message, options, ...items) => {
      assert.match(message, /Delete me/)
      assert.match(message, /permanent/i)
      assert.equal(options.modal, true)
      return items[0]
    },
  })
  assert.deepEqual(calls, [["file:///workspace-a", "session-1"], "closed"])
})

test("canceling deletion preserves the session and its tab", async () => {
  await deleteSession({
    target,
    sessions: { delete: async () => { assert.fail("must not delete") } },
    closeSession: () => { assert.fail("must not close") },
    showWarningMessage: async () => undefined,
  })
})

test("failed deletion keeps the session tab open", async () => {
  await assert.rejects(deleteSession({
    target,
    sessions: { delete: async () => { throw new Error("server error") } },
    closeSession: () => { assert.fail("must not close") },
    showWarningMessage: async () => "Delete Session",
  }), /server error/)
})

test("declares deletion in the manifest and exposes it on shared and unshared sidebar sessions", () => {
  const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"))
  assert.ok(manifest.activationEvents.includes("onCommand:opencode-ide-chat.deleteSession"))
  assert.ok(manifest.contributes.commands.some((item: { command: string }) => item.command === "opencode-ide-chat.deleteSession"))
  const entry = manifest.contributes.menus["view/item/context"].find((item: { command: string }) => item.command === "opencode-ide-chat.deleteSession")
  assert.ok(entry)
  assert.match(entry.when, /viewItem == session\b/)
  assert.match(entry.when, /viewItem == session-shared/)
})

test("exposes selected transcript text in a dedicated Copy context command", () => {
  const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"))
  const entry = manifest.contributes.menus["webview/context"].find((item: { command: string }) => item.command === "opencode-ide-chat.copySelectedText")
  assert.ok(entry)
  assert.match(entry.when, /webviewSection == 'transcript'/)
  assert.match(entry.when, /opencodeHasSelection/)
  const shortcut = manifest.contributes.keybindings?.find((item: { command: string }) => item.command === "opencode-ide-chat.copySelectedText")
  assert.ok(shortcut)
  assert.equal(shortcut.key, "ctrl+c")
  assert.equal(shortcut.mac, "cmd+c")
  assert.match(shortcut.when, /webviewFocus/)
  assert.match(shortcut.when, /opencodeHasSelection/)
})
