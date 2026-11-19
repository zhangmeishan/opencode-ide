import assert from "node:assert/strict"
import { describe, test } from "node:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { ComposerAgentToggle } from "./composer-agent-toggle"

describe("ComposerAgentToggle", () => {
  test("renders the current agent as a button for switching modes", () => {
    const html = renderToStaticMarkup(
      <ComposerAgentToggle current="build" next="plan" colorClass="oc-agentColor-0" onToggle={() => true} />,
    )

    assert.equal(html.includes('type="button"'), true)
    assert.equal(html.includes('aria-label="Switch agent from build to plan"'), true)
    assert.equal(html.includes('title="Switch agent from build to plan"'), true)
    assert.equal(html.includes(">build<"), true)
  })
})
