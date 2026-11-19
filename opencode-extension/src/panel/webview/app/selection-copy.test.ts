import assert from "node:assert/strict"
import { test } from "node:test"
import { bindSelectionCopy } from "./selection-copy"

test("copies arbitrary selected text through the host for shortcuts and native Copy events", () => {
  const target = new EventTarget()
  const copied: string[] = []
  let selection = "Selected output\n第二行"
  const dispose = bindSelectionCopy(target, () => selection, (text) => copied.push(text))
  const key = new Event("keydown", { cancelable: true })
  Object.assign(key, { key: "c", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, isComposing: false })
  target.dispatchEvent(key)
  assert.equal(key.defaultPrevented, true)
  const copy = new Event("copy", { cancelable: true })
  target.dispatchEvent(copy)
  assert.equal(copy.defaultPrevented, true)
  const mac = new Event("keydown", { cancelable: true })
  Object.assign(mac, { key: "c", ctrlKey: false, metaKey: true, altKey: false, shiftKey: false })
  target.dispatchEvent(mac)
  assert.equal(mac.defaultPrevented, true)
  assert.deepEqual(copied, [selection, selection, selection])
  selection = ""
  const empty = new Event("copy", { cancelable: true })
  target.dispatchEvent(empty)
  assert.equal(empty.defaultPrevented, false)
  dispose()
  selection = "after disposal"
  target.dispatchEvent(new Event("copy"))
  assert.equal(copied.length, 3)
})

test("preserves cut, paste, and modified shortcuts", () => {
  const target = new EventTarget()
  const copied: string[] = []
  const dispose = bindSelectionCopy(target, () => "selected", (text) => copied.push(text))
  for (const [key, altKey, shiftKey] of [["x", false, false], ["v", false, false], ["c", true, false], ["c", false, true]] as const) {
    const event = new Event("keydown", { cancelable: true })
    Object.assign(event, { key, ctrlKey: true, metaKey: false, altKey, shiftKey })
    target.dispatchEvent(event)
    assert.equal(event.defaultPrevented, false)
  }
  assert.deepEqual(copied, [])
  dispose()
})
