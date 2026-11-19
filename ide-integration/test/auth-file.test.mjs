import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, writeFile, readFile, stat, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { verifyPassword } from "../../scripts/auth.mjs"

test("credentials file creates and rotates credentials on every deployment without exposing plaintext", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ide-auth-file-"))
  const source = path.join(dir, "login credentials.json")
  const runtime = path.join(dir, "data")
  const run = () => execFileSync(process.execPath, ["scripts/configure-auth.mjs", "--credentials-file", source], { env: { ...process.env, OPENCODE_IDE_DATA_DIR: runtime }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  try {
    for (const password of ["first-password-123", "second-password-456"]) {
      await writeFile(source, JSON.stringify({ username: "owner", password }))
      assert.ok(!run().includes(password))
      const stored = await readFile(path.join(runtime, "auth.json"), "utf8")
      assert.ok(!stored.includes(password))
      assert.equal(verifyPassword(JSON.parse(stored), "owner", password), true)
      assert.equal((await stat(path.join(runtime, "auth.json"))).mode & 0o777, 0o600)
    }
    const before = await readFile(path.join(runtime, "auth.json"), "utf8")
    await writeFile(source, JSON.stringify({ username: "owner", password: "short" }))
    assert.throws(run)
    assert.equal(await readFile(path.join(runtime, "auth.json"), "utf8"), before)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
