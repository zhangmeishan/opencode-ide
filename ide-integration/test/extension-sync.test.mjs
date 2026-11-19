import assert from "node:assert/strict"
import { test } from "node:test"
import { createOpenVsxLookup, canSyncInstall, planSync, isSyncable } from "../src/extension-sync.cjs"

const ext = (version, timestamp = 1) => ({ id: "example.tools", version, timestamp, publisher: "example", engines: { vscode: "^1.90.0" } })
test("first sync merges installs and takes the newer version", () => {
  assert.deepEqual(planSync({ web: ext("1.0.0"), ssh: ext("2.0.0") }), { from: "ssh", to: "web", action: "install" })
  assert.deepEqual(planSync({ web: ext("1.0.0") }), { from: "web", to: "ssh", action: "install" })
})
test("updates and explicit downgrades propagate from the changed side", () => {
  const previous = { web: "2.0.0", ssh: "2.0.0" }
  assert.deepEqual(planSync({ web: ext("1.0.0"), ssh: ext("2.0.0"), previous }), { from: "web", to: "ssh", action: "install" })
  assert.deepEqual(planSync({ web: ext("2.0.0"), ssh: ext("3.0.0"), previous }), { from: "ssh", to: "web", action: "install" })
})
test("uninstalls propagate without resurrecting the deleted extension", () => {
  const previous = { web: "2.0.0", ssh: "2.0.0" }
  assert.deepEqual(planSync({ ssh: ext("2.0.0"), previous }), { from: "web", to: "ssh", action: "uninstall" })
  assert.deepEqual(planSync({ web: ext("2.0.0"), previous }), { from: "ssh", to: "web", action: "uninstall" })
  assert.equal(planSync({ previous: { web: null, ssh: null } }), undefined)
})
test("simultaneous edits choose the latest install and deletion wins delete/update conflicts", () => {
  const previous = { web: "1.0.0", ssh: "1.0.0" }
  assert.deepEqual(planSync({ web: ext("2.0.0", 30), ssh: ext("3.0.0", 20), previous }), { from: "web", to: "ssh", action: "install" })
  assert.deepEqual(planSync({ ssh: ext("3.0.0"), previous }), { from: "web", to: "ssh", action: "uninstall" })
})
test("Microsoft publishers synchronize only when published on Open VSX", async () => {
  for (const publisher of ["Microsoft", "ms-python", "ms-vscode", "ms-vscode-remote", "vscode"]) {
    const extension = { ...ext("1.0.0"), publisher }
    assert.equal(isSyncable(extension), true)
    assert.equal(await canSyncInstall(extension, async () => false), false)
    assert.equal(await canSyncInstall(extension, async () => true), true)
  }
  assert.equal(isSyncable(ext("1.0.0")), true)
  assert.equal(isSyncable({ ...ext("1.0.0"), id: "opencode-ide.opencode-ide-integration" }), false)
  assert.equal(isSyncable({ ...ext("1.0.0"), id: "opencode-ide.opencode-ide-chat" }), false)
})

test("Open VSX lookup accepts exact Microsoft IDs and is injectable", async () => {
  const queries = []
  const available = await canSyncInstall({ ...ext("1.0.0"), publisher: "Microsoft", id: "ms-python.python" }, async id => { queries.push(id); return id === "ms-python.python" })
  const unavailable = await canSyncInstall({ ...ext("1.0.0"), publisher: "Microsoft", id: "ms-vscode.copilot" }, async id => { queries.push(id); return false })
  assert.equal(available, true)
  assert.equal(unavailable, false)
  assert.deepEqual(queries, ["ms-python.python", "ms-vscode.copilot"])
})

test("all publishers require an Open VSX listing; OpenCode stays excluded", async () => {
  assert.equal(await canSyncInstall(ext("1.0.0"), async () => false), false)
  assert.equal(await canSyncInstall(ext("1.0.0"), async () => true), true)
  assert.equal(await canSyncInstall({ id: "opencode-ide.opencode-ide-chat" }, async () => { throw new Error("must not query") }), false)
})

test("Open VSX lookup validates metadata, caches results and retries network failures", async () => {
  let calls = 0
  let now = 0
  const lookup = createOpenVsxLookup(async url => {
    calls++
    if (url.endsWith('/ms-vscode/cpptools')) return { ok: false, status: 404 }
    return { ok: true, json: async () => ({ namespace: "ms-python", name: "python", downloadable: true, files: { download: "https://open-vsx.org/example.vsix" } }) }
  }, () => now)
  assert.equal(await lookup("MS-PYTHON.PYTHON"), true)
  assert.equal(await lookup("ms-python.python"), true)
  assert.equal(calls, 1)
  assert.equal(await lookup("ms-vscode.cpptools"), false)
  now = 3600001
  assert.equal(await lookup("ms-python.python"), true)
  let fail = true
  const retry = createOpenVsxLookup(async () => { if (fail) throw new Error("network down"); return { ok: false, status: 404 } })
  await assert.rejects(() => retry("example.tools"), /network down/)
  fail = false
  assert.equal(await retry("example.tools"), false)
  const invalid = createOpenVsxLookup(async () => ({ ok: true, json: async () => ({ name: "wrong" }) }))
  await assert.rejects(() => invalid("example.tools"), /无效/)
})

test("extensions installed at the same version on both sides establish a baseline", () => {
  assert.equal(planSync({ web: ext("2.0.0"), ssh: ext("2.0.0") }), undefined)
})

test("OpenCode IDE extensions are excluded even when referenced by old sync state", () => {
  for (const id of ["opencode-ide.opencode-ide-chat", "meishan.opencode-enhanced-ui", "MEISHAN.OPENCODE-ENHANCED-UI", "opencode-ide.opencode-ide-integration"]) {
    assert.equal(isSyncable({ id }), false)
    assert.equal(isSyncable({ ...ext("1.0.0"), id }), false)
  }
  assert.equal(isSyncable({ id: "example.tools" }), true)
})
