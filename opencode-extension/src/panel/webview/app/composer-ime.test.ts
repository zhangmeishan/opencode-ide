import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { shouldDeferComposerInput } from "./composer-ime"

describe("composer IME input", () => {
  test("defers React state updates while composition is active", () => {
    assert.equal(shouldDeferComposerInput(true, false), true)
    assert.equal(shouldDeferComposerInput(false, true), true)
    assert.equal(shouldDeferComposerInput(false, false), false)
  })
})
