import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import { hideAccounts } from "../../scripts/workbench-state.mjs"
import { readFile } from "node:fs/promises"

test("terminals stay in the bottom panel and use the compact session selector", async () => {
  const settings = JSON.parse(await readFile(new URL("../../config/settings.json", import.meta.url), "utf8"))
  assert.equal(settings["terminal.integrated.defaultLocation"], "view")
  assert.equal(settings["terminal.integrated.tabs.enabled"], false)
})

test("Accounts is hidden in default and named profiles without changing unrelated state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ide-accounts-"))
  try {
    await mkdir(path.join(root, "User/profiles/custom/globalStorage"), { recursive: true })
    await hideAccounts(root)
    const inspect = () => JSON.parse(execFileSync("python3", ["-c", `import sqlite3,json,sys,pathlib
r=pathlib.Path(sys.argv[1]); result=[]
for f in [r/'User/globalStorage/state.vscdb',r/'User/profiles/custom/globalStorage/state.vscdb']:
 with sqlite3.connect(f) as c:
  result.append(c.execute('SELECT value FROM ItemTable WHERE key=?',('workbench.activity.showAccounts',)).fetchone()[0])
  c.execute('INSERT OR REPLACE INTO ItemTable(key,value) VALUES (?,?)',('keep-me','value'))
print(json.dumps(result))`, root], { encoding: "utf8" }))
    assert.deepEqual(inspect(), ["false", "false"])
    await hideAccounts(root)
    assert.deepEqual(inspect(), ["false", "false"])
    const preserved = execFileSync("python3", ["-c", "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); print(c.execute('SELECT value FROM ItemTable WHERE key=?',('keep-me',)).fetchone()[0])", path.join(root, "User/globalStorage/state.vscdb")], { encoding: "utf8" })
    assert.equal(preserved.trim(), "value")
  } finally { await rm(root, { recursive: true, force: true }) }
})
