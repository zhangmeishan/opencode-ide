import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { execFile } from "node:child_process"
import { inventory, packageExtension, syncExtensions } from "../src/extension-sync.cjs"

test("real CLIs synchronize installs, updates and removals in both directions", { skip: !process.env.SYNC_TEST_WEB_CLI || !process.env.SYNC_TEST_SSH_CLI }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ide-sync-test-"))
  const web = path.join(root, "web")
  const ssh = path.join(root, "ssh")
  const fixture = path.join(root, "fixture")
  const env = { ...process.env }
  for (const key of ["CODE_SERVER_PARENT_PID", "VSCODE_IPC_HOOK_CLI", "CODE_SERVER_SESSION_SOCKET", "ELECTRON_RUN_AS_NODE"]) delete env[key]
  const exec = promisify(execFile)
  const run = (cli, dir, args) => exec(cli, ["--extensions-dir", dir, "--user-data-dir", path.join(root, "user-data"), ...args], { env, timeout: 60000 })
  try {
    for (const dir of [web, ssh, fixture]) await mkdir(dir)
    for (const dir of [web, ssh]) await writeFile(path.join(dir, "extensions.json"), "[]")
    const install = async (cli, dir, version, publisher = "example", name = "sync-fixture") => {
      await writeFile(path.join(fixture, "package.json"), JSON.stringify({ name, publisher, version, engines: { vscode: "^1.90.0" }, main: "./extension.js" }))
      await writeFile(path.join(fixture, "extension.js"), "exports.activate = () => {}")
      const vsix = path.join(root, "fixture.vsix")
      await packageExtension({ dir: fixture }, vsix)
      await run(cli, dir, ["--install-extension", vsix, "--force"])
    }
    let registryAvailable = true
    let registryError = false
    const options = { webDirectory: web, webUserData: path.join(root, "user-data"), webCli: process.env.SYNC_TEST_WEB_CLI,
      ssh: { cli: process.env.SYNC_TEST_SSH_CLI, directory: ssh, version: "1.144.0" }, stateFile: path.join(root, "state.json"), log: () => {}, openVsxLookup: async () => { if (registryError) throw new Error("network unavailable"); return registryAvailable } }
    const sync = async expected => {
      const result = await syncExtensions(options)
      assert.deepEqual(result.skipped, [])
      for (const dir of [web, ssh]) assert.equal((await inventory(dir)).get("example.sync-fixture")?.version, expected)
    }
    await install(options.webCli, web, "1.0.0")
    await sync("1.0.0")
    await install(options.ssh.cli, ssh, "2.0.0")
    await sync("2.0.0")
    await run(options.webCli, web, ["--uninstall-extension", "example.sync-fixture"])
    await sync(undefined)
    await sync(undefined)
    await install(options.ssh.cli, ssh, "1.0.0", "ms-fixture", "tools")
    registryAvailable = false
    assert.equal((await syncExtensions(options)).installed, 0)
    assert.equal((await inventory(web)).has("ms-fixture.tools"), false)
    registryAvailable = true
    assert.equal((await syncExtensions(options)).installed, 1)
    assert.equal((await inventory(web)).get("ms-fixture.tools")?.version, "1.0.0")
    await run(options.webCli, web, ["--uninstall-extension", "ms-fixture.tools"])
    const baseline = await readFile(options.stateFile, "utf8")
    registryError = true
    const offline = await syncExtensions(options)
    assert.equal(offline.uninstalled, 0)
    assert.ok(offline.skipped.some(message => message.includes("network unavailable")))
    assert.equal(await readFile(options.stateFile, "utf8"), baseline)
    registryError = false
    assert.equal((await syncExtensions(options)).uninstalled, 1)
    assert.equal((await inventory(ssh)).has("ms-fixture.tools"), false)
    await install(options.ssh.cli, ssh, "3.0.0")
    await sync("3.0.0")
    await install(options.webCli, web, "4.0.0")
    await sync("4.0.0")
    await run(options.ssh.cli, ssh, ["--uninstall-extension", "example.sync-fixture"])
    await sync(undefined)
    await sync(undefined)
    // An old synchronized OpenCode entry must not delete the WebUI copy or reinstall the SSH copy.
    await install(options.webCli, web, "1.0.0", "opencode-ide", "opencode-ide-chat")
    const state = JSON.parse(await readFile(options.stateFile, "utf8"))
    state.entries["opencode-ide.opencode-ide-chat"] = { web: "1.0.0", ssh: "1.0.0" }
    await writeFile(options.stateFile, JSON.stringify(state))
    const excluded = await syncExtensions(options)
    assert.equal(excluded.installed, 0)
    assert.equal(excluded.uninstalled, 0)
    assert.deepEqual(excluded.skipped, [])
    assert.ok((await run(options.webCli, web, ["--list-extensions"])).stdout.includes("opencode-ide.opencode-ide-chat"))
    assert.ok(!(await run(options.ssh.cli, ssh, ["--list-extensions"])).stdout.includes("opencode-ide.opencode-ide-chat"))
  } finally { await rm(root, { recursive: true, force: true }) }
})
