import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { test } from "node:test"

test("IDE chat is owned by this repository and has an independent extension identity", () => {
  const chat = JSON.parse(readFileSync("opencode-extension/package.json", "utf8"))
  const workbench = JSON.parse(readFileSync("ide-integration/package.json", "utf8"))
  assert.equal(existsSync("opencode-extension/.git"), false)
  assert.equal(existsSync(".gitmodules"), false)
  assert.equal(`${chat.publisher}.${chat.name}`, "opencode-ide.opencode-ide-chat")
  assert.equal(chat.displayName, "OpenCode IDE Chat")
  assert.equal(chat.repository.url, "https://github.com/zhangmeishan/opencode-ide.git")
  assert.deepEqual(workbench.extensionDependencies, ["opencode-ide.opencode-ide-chat"])
  assert.ok(Object.keys(chat.contributes.configuration.properties).every(key => key.startsWith("opencode-ide-chat.")))
  assert.ok(chat.contributes.commands.every(item => item.command.startsWith("opencode-ide-chat.")))
})
