import assert from "node:assert/strict"
import { test } from "node:test"
import * as vscode from "vscode"
import type { ComposerPromptPart, HostMessage, SessionPanelRef } from "../bridge/types"
import type { EventHub } from "../core/events"
import type { WorkspaceManager } from "../core/workspace"
import type { FocusedSessionStore } from "../sidebar/focused"
import { SessionViewProvider } from "../sidebar/session-view-provider"
import { SessionPanelSerializer } from "../panel/serializer"

const ref: SessionPanelRef = { workspaceId: "file:///workspace", dir: "/workspace", sessionId: "session-a" }
const parts: ComposerPromptPart[] = [{ type: "text", text: "@main.tex" }]

function harness() {
  const messages: HostMessage[] = []
  const selected: SessionPanelRef[] = []
  const provider = new SessionViewProvider(
    vscode.Uri.file("/extension"),
    { onDidChange: () => ({ dispose() {} }) } as unknown as WorkspaceManager,
    { onDidEvent: () => ({ dispose() {} }) } as unknown as EventHub,
    {
      onDidChange: () => ({ dispose() {} }),
      selectSession: (next: SessionPanelRef) => selected.push(next),
    } as unknown as FocusedSessionStore,
    { appendLine() {} } as unknown as vscode.OutputChannel,
  )
  const state = provider as unknown as {
    view: vscode.WebviewView
    currentRef?: SessionPanelRef
    ready: boolean
    onMessage(message: { type: "ready" }): void
    push(): Promise<void>
  }
  state.view = {
    webview: {
      html: "",
      asWebviewUri: (uri: vscode.Uri) => uri,
      postMessage: async (message: HostMessage) => { messages.push(message); return true },
    },
  } as unknown as vscode.WebviewView
  state.push = async () => {}
  return { provider, state, messages, selected }
}

test("opening a session selects the right sidebar session and queues context until ready", async () => {
  const { provider, state, messages, selected } = harness()
  await provider.open(ref, parts)
  assert.deepEqual(selected, [ref])
  assert.deepEqual(state.currentRef, ref)
  assert.deepEqual(messages, [])
  state.onMessage({ type: "ready" })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(messages, [{ type: "restoreComposer", parts }, { type: "focusComposer" }])
  provider.dispose()
})

test("switching sessions discards pending context from the previous session", async () => {
  const { provider, state, messages } = harness()
  await provider.open(ref, parts)
  await provider.open({ ...ref, sessionId: "session-b" })
  state.onMessage({ type: "ready" })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(messages, [{ type: "focusComposer" }])
  provider.dispose()
})

test("image preview actions are sent to the sidebar conversation", async () => {
  const { provider, messages } = harness()
  await provider.runImagePreviewCommand("copy")
  await provider.runImagePreviewCommand("save")
  assert.deepEqual(messages, [
    { type: "imagePreviewCommand", action: "copy" },
    { type: "imagePreviewCommand", action: "save" },
  ])
  provider.dispose()
})

test("restoring an old editor chat migrates its session to the sidebar and closes the tab", async () => {
  const opened: SessionPanelRef[] = []
  let disposed = false
  const serializer = new SessionPanelSerializer(async next => { opened.push(next) })
  await serializer.deserializeWebviewPanel({ dispose() { disposed = true } } as vscode.WebviewPanel, ref)
  assert.deepEqual(opened, [ref])
  assert.equal(disposed, true)
})
