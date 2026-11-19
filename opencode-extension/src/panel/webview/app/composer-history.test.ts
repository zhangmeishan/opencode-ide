import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { ComposerHistory, composerHistoryAction } from "./composer-history"
import { emptyComposerParts, replaceRangeWithMention, replaceRangeWithText } from "./composer-editor"
import type { ComposerEditorPart } from "./state"

const text = (content: string): ComposerEditorPart[] => [{ type: "text", content, start: 0, end: content.length }]
const cursor = (start: number, end = start) => ({ start, end })

describe("composer edit history", () => {
  test("undoes typing, paste, and newline independently and redoes them", () => {
    const history = new ComposerHistory(emptyComposerParts())
    history.record(text("hello"), cursor(5))
    history.record(text("hello pasted"), cursor(12))
    history.record(text("hello pasted\n"), cursor(13))
    assert.deepEqual(history.undo()?.parts, text("hello pasted"))
    assert.deepEqual(history.undo()?.parts, text("hello"))
    assert.deepEqual(history.redo()?.parts, text("hello pasted"))
    assert.deepEqual(history.redo()?.parts, text("hello pasted\n"))
    assert.equal(history.redo(), undefined)
  })

  test("restores the replaced selection and file mention metadata", () => {
    const history = new ComposerHistory(text("explain "))
    const mention = replaceRangeWithMention(text("explain "), 8, 8, {
      type: "file", path: "src/app.ts", selection: { startLine: 2, endLine: 5 }, content: "@src/app.ts#2-5",
    })
    history.record(mention.parts, cursor(mention.cursor))
    history.select(cursor(0, mention.cursor))
    history.record(replaceRangeWithText(mention.parts, 0, mention.cursor, "replacement").parts, cursor(11))
    assert.deepEqual(history.undo(), { parts: mention.parts, selection: cursor(0, mention.cursor) })
    assert.deepEqual(history.undo()?.parts, text("explain "))
  })

  test("ignores unchanged state, drops redo on a new edit, and resets between sessions", () => {
    const history = new ComposerHistory(emptyComposerParts())
    history.record(text("a"), cursor(1))
    history.record(text("a"), cursor(0))
    assert.deepEqual(history.undo()?.parts, emptyComposerParts())
    history.record(text("b"), cursor(1))
    assert.equal(history.redo(), undefined)
    const otherSession = new ComposerHistory(text("other session"))
    assert.equal(otherSession.undo(), undefined)
  })

  test("bounds retained edits", () => {
    const history = new ComposerHistory(emptyComposerParts())
    for (let i = 1; i <= 150; i += 1) history.record(text(String(i)), cursor(String(i).length))
    let count = 0
    while (history.undo()) count += 1
    assert.equal(count, 100)
  })
})

describe("composer history shortcuts", () => {
  const key = (value: string, modifiers = {}) => ({ key: value, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers })
  test("supports Windows/Linux and macOS undo/redo", () => {
    assert.equal(composerHistoryAction(key("z", { ctrlKey: true })), "undo")
    assert.equal(composerHistoryAction(key("z", { metaKey: true })), "undo")
    assert.equal(composerHistoryAction(key("Z", { metaKey: true, shiftKey: true })), "redo")
    assert.equal(composerHistoryAction(key("z", { ctrlKey: true, shiftKey: true })), "redo")
    assert.equal(composerHistoryAction(key("y", { ctrlKey: true })), "redo")
    assert.equal(composerHistoryAction(key("z")), undefined)
    assert.equal(composerHistoryAction(key("z", { ctrlKey: true, altKey: true })), undefined)
  })
})
