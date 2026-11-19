import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { client } from "../core/sdk"
import { freeport, health } from "../core/server"
import { saveWorkspaceSettings } from "../sidebar/settings-config"

test("saved workspace settings load through the real OpenCode API and preserve unrelated fields", { skip: !process.env.SETTINGS_TEST_OPENCODE }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ide-settings-test-"))
  const workspace = path.join(root, "workspace")
  await mkdir(workspace)
  await writeFile(path.join(workspace, "opencode.json"), JSON.stringify({ $schema: "https://opencode.ai/config.json", instructions: ["keep-me.md"], provider: { fixture: { name: "Keep me", options: { timeout: 12345 } } } }))
  await saveWorkspaceSettings(workspace, { model: "fixture/test-model", agent: "build", providerID: "fixture", baseURL: "https://models.example/v1", customModel: "test-model" })
  const port = await freeport()
  const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: path.join(root, "config"), XDG_DATA_HOME: path.join(root, "data"), XDG_CACHE_HOME: path.join(root, "cache"), OPENCODE_DISABLE_DEFAULT_PLUGINS: "1" }
  delete env.OPENCODE_CONFIG
  delete env.OPENCODE_CONFIG_CONTENT
  const child = spawn(process.env.SETTINGS_TEST_OPENCODE!, ["serve", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: workspace, env, stdio: "ignore" })
  try {
    await health(`http://127.0.0.1:${port}`, 1000, 30)
    const sdk = await client(`http://127.0.0.1:${port}`, workspace)
    const result = await sdk.config.get({ directory: workspace })
    assert.equal(result.data?.model, "fixture/test-model")
    const saved = JSON.parse(await readFile(path.join(workspace, "opencode.json"), "utf8"))
    assert.equal(saved.model, "fixture/test-model")
    assert.deepEqual(saved.instructions, ["keep-me.md"])
    assert.equal(saved.provider.fixture.name, "Keep me")
    assert.equal(saved.provider.fixture.options.timeout, 12345)
    assert.equal(saved.provider.fixture.options.baseURL, "https://models.example/v1")
  } finally {
    child.kill()
    await new Promise<void>(resolve => child.once("exit", () => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
