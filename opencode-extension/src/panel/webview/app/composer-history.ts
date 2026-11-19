import { composerPartsEqual, normalizeComposerParts } from "./composer-editor"
import type { ComposerEditorPart } from "./state"

type Selection = { start: number; end: number }
type Snapshot = { parts: ComposerEditorPart[]; selection: Selection }

export class ComposerHistory {
  private past: Snapshot[] = []
  private future: Snapshot[] = []
  private current: Snapshot

  constructor(parts: ComposerEditorPart[]) {
    this.current = this.snapshot(parts)
  }

  select(selection: Selection) {
    this.current.selection = { ...selection }
  }

  record(parts: ComposerEditorPart[], selection: Selection) {
    if (!composerPartsEqual(this.current.parts, parts)) {
      this.past.push(this.current)
      if (this.past.length > 100) this.past.shift()
      this.future = []
    }
    this.current = this.snapshot(parts, selection)
  }

  undo() {
    const previous = this.past.pop()
    if (!previous) return undefined
    this.future.push(this.current)
    this.current = previous
    return this.snapshot(previous.parts, previous.selection)
  }

  redo() {
    const next = this.future.pop()
    if (!next) return undefined
    this.past.push(this.current)
    this.current = next
    return this.snapshot(next.parts, next.selection)
  }

  private snapshot(parts: ComposerEditorPart[], selection?: Selection): Snapshot {
    const normalized = normalizeComposerParts(parts)
    const end = normalized.at(-1)?.end ?? 0
    return { parts: normalized, selection: { ...(selection ?? { start: end, end }) } }
  }
}

export function composerHistoryAction(event: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}) {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey) return undefined
  const key = event.key.toLowerCase()
  if (key === "z") return event.shiftKey ? "redo" : "undo"
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) return "redo"
  return undefined
}
