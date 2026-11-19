import * as vscode from "vscode"
import type { SessionPanelRef } from "../bridge/types"
import { reviveState } from "./provider/restore-state"

export class SessionPanelSerializer implements vscode.WebviewPanelSerializer {
  constructor(private open: (ref: SessionPanelRef) => Promise<void>) {}

  async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown) {
    const ref = reviveState(state)
    panel.dispose()
    if (ref) await this.open(ref)
  }
}
