import assert from "node:assert/strict"
import { test } from "node:test"
import { execFileSync } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

test("Python demo runs without packages and produces JSON and HTML reports", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "ide-python-demo-"))
  try {
    const stdout = execFileSync("python3", ["examples/python-demo/main.py", "--output-dir", output], { encoding: "utf8" })
    const report = JSON.parse(await readFile(path.join(output, "summary.json"), "utf8"))
    assert.equal(report.total, 150)
    assert.equal(report.count, 6)
    assert.deepEqual(report.by_category, { books: 60, food: 50, travel: 40 })
    assert.ok(stdout.includes("150"))
    const html = await readFile(path.join(output, "report.html"), "utf8")
    assert.ok(html.includes("books"))
    assert.ok(html.includes("150"))
    assert.ok(!html.includes("<script"))
  } finally { await rm(output, { recursive: true, force: true }) }
})
