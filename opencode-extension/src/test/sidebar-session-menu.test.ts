import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { test } from "node:test"

test("Sessions sidebar exposes rename, tags, and delete without sharing or archive actions", () => {
  const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"))
  const entries: Array<{ command: string; when: string; group: string }> = manifest.contributes.menus["view/item/context"]
  const sessionActions = entries.filter((entry) => entry.when.includes("view == opencode-ide-chat.sessions") && /viewItem == session\b/.test(entry.when))

  assert.deepEqual(sessionActions.map((entry) => entry.command).sort(), [
    "opencode-ide-chat.deleteSession",
    "opencode-ide-chat.manageSessionTags",
    "opencode-ide-chat.renameSession",
  ])
  for (const entry of sessionActions) {
    assert.match(entry.when, /viewItem == session-shared/)
    assert.match(entry.group, /^inline@/)
  }
})
