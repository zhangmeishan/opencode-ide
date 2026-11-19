export function bindSelectionCopy(
  target: EventTarget,
  selectedText: () => string,
  copy: (text: string) => void,
) {
  const onCopy = (event: Event) => {
    const text = selectedText()
    if (!text) return
    event.preventDefault()
    event.stopPropagation()
    copy(text)
  }
  const onKeyDown = (event: Event) => {
    const key = event as KeyboardEvent
    if (key.isComposing || (!key.ctrlKey && !key.metaKey) || key.altKey || key.shiftKey || key.key.toLowerCase() !== "c") return
    onCopy(event)
  }
  target.addEventListener("copy", onCopy, true)
  target.addEventListener("keydown", onKeyDown, true)
  return () => {
    target.removeEventListener("copy", onCopy, true)
    target.removeEventListener("keydown", onKeyDown, true)
  }
}
