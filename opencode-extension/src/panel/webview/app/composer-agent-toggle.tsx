import React from "react"

export function ComposerAgentToggle({
  current,
  next,
  colorClass,
  onToggle,
}: {
  current: string
  next?: string
  colorClass: string
  onToggle: () => void
}) {
  const label = next ? `Switch agent from ${current} to ${next}` : `Current agent: ${current}`
  return (
    <button
      type="button"
      className={`oc-composerAgentToggle oc-composerAgent ${colorClass}`}
      aria-label={label}
      title={label}
      onClick={onToggle}
      disabled={!next}
    >
      {current}
    </button>
  )
}
