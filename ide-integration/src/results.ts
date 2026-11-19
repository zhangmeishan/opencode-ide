import * as vscode from "vscode"
import { randomBytes } from "node:crypto"
import { resultOpenOptions } from "./layout-policy.cjs"

const viewType = "opencode-ide.results"

export class Results implements vscode.WebviewPanelSerializer, vscode.Disposable {
  private panel?: vscode.WebviewPanel
  private readonly bag: vscode.Disposable[] = []

  async show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Active, true)
      return
    }
    this.attach(vscode.window.createWebviewPanel(viewType, "执行结果", resultOpenOptions(), { enableScripts: true, retainContextWhenHidden: true }))
  }

  async open(uri?: vscode.Uri) {
    const selected = uri ?? (await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: "打开运行结果", filters: { "结果文件": ["json", "csv", "html", "svg", "png", "jpg", "ipynb", "txt", "log", "pdf"], "所有文件": ["*"] } }))?.[0]
    if (!selected) return
    await vscode.commands.executeCommand("vscode.open", selected, resultOpenOptions())
  }

  async deserializeWebviewPanel(panel: vscode.WebviewPanel) { panel.dispose() }

  close() {
    this.panel?.dispose()
    this.panel = undefined
  }

  private attach(panel: vscode.WebviewPanel) {
    this.panel = panel
    panel.webview.options = { enableScripts: true, localResourceRoots: [] }
    const nonce = randomBytes(16).toString("hex")
    panel.webview.html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:32px;line-height:1.7}main{max-width:520px;margin:8vh auto}small,p{color:var(--vscode-descriptionForeground)}h1{font-size:25px}button{display:block;margin:12px 0;padding:9px 16px;cursor:pointer;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;border-radius:5px}button:hover{background:var(--vscode-button-hoverBackground)}code{color:var(--vscode-textLink-foreground)}</style></head><body><main><small>OPENCODE IDE · RESULTS</small><h1>查看运行结果</h1><p>选择生成的 JSON、CSV、图片或报告，在当前编辑组中打开。右侧 OpenCode 可继续使用。</p><button data-action="open">打开结果文件</button><button data-action="terminal">打开原生终端</button><button data-action="agent">打开右侧 OpenCode</button><h2>Python 示例</h2><p>在示例项目终端运行 <code>python3 main.py</code>，查看终端输出，或打开 <code>output/summary.json</code>。生成的 <code>output/report.html</code> 可下载到浏览器查看。</p><p>本页不会自动执行程序，也不代表运行成功。</p></main><script nonce="${nonce}">const vscode=acquireVsCodeApi();vscode.setState({version:1});document.querySelectorAll('button').forEach(button=>button.onclick=()=>vscode.postMessage({action:button.dataset.action}));</script></body></html>`
    this.bag.push(panel.onDidDispose(() => { if (this.panel === panel) this.panel = undefined }))
    this.bag.push(panel.webview.onDidReceiveMessage((message: unknown) => {
      if (!message || typeof message !== "object" || !("action" in message)) return
      const command = message.action === "open" ? "opencode-ide.openResult" : message.action === "terminal" ? "opencode-ide.openTerminal" : message.action === "agent" ? "opencode-ide.openAgent" : undefined
      if (command) void vscode.commands.executeCommand(command)
    }))
  }

  dispose() { vscode.Disposable.from(...this.bag).dispose() }
}

export const resultsViewType = viewType
