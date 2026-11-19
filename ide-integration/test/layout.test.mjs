import assert from "node:assert/strict"
import { test } from "node:test"
import { shouldInitialize, requiresSplit, resultOpenOptions } from "../src/layout-policy.cjs"

test("layout initializes once without overriding restored workspace geometry", () => {
  assert.equal(shouldInitialize(true, undefined), true)
  assert.equal(shouldInitialize(true, 3), false)
  assert.equal(shouldInitialize(true, 2), true)
  assert.equal(shouldInitialize(false, undefined), false)
})

test("results use the active editor group without forcing an extra group", () => {
  assert.equal(requiresSplit(1), true)
  assert.equal(requiresSplit(2), false)
  assert.equal(requiresSplit(3), false)
  assert.deepEqual(resultOpenOptions(), { viewColumn: -1, preview: false, preserveFocus: true })
})
