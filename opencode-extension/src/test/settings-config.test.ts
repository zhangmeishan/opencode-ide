import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { parse } from "jsonc-parser"
import { saveWorkspaceSettings } from "../sidebar/settings-config"

test("JSONC settings preserve comments, provider options and model limits", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ide-config-"))
  try {
    const file = path.join(dir, "opencode.jsonc")
    await writeFile(file, '// Keep my comment\n{"provider":{"local":{"npm":"custom-adapter","options":{"timeout":123},"models":{"test":{"name":"old","limit":{"context":10000,"output":2000}}}}},"instructions":["AGENTS.md"]}')
    await saveWorkspaceSettings(dir, { model: "local/test", providerID: "local", customModel: "test", baseURL: "https://example.com/v1" })
    const content = await readFile(file, "utf8")
    assert.ok(content.includes("// Keep my comment"))
    const config = parse(content)
    assert.equal(config.provider.local.npm, "custom-adapter")
    assert.equal(config.provider.local.options.timeout, 123)
    assert.deepEqual(config.provider.local.models.test.limit, { context: 10000, output: 2000 })
    assert.deepEqual(config.instructions, ["AGENTS.md"])
    await writeFile(file, "broken json")
    await assert.rejects(() => saveWorkspaceSettings(dir, { model: "local/test" }))
    assert.equal(await readFile(file, "utf8"), "broken json")
  } finally { await rm(dir, { recursive: true, force: true }) }
})
