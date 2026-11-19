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
    const selected = uri ?? (await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: "在独立结果窗口打开", filters: { "结果文件": ["pdf", "html", "svg", "png", "jpg", "ipynb", "txt", "log"], "所有文件": ["*"] } }))?.[0]
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
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:32px;line-height:1.7}main{max-width:520px;margin:8vh auto}small{color:var(--vscode-descriptionForeground);letter-spacing:.15em}h1{font-size:25px;font-weight:600}p{color:var(--vscode-descriptionForeground)}button{display:block;margin:12px 0;padding:9px 16px;cursor:pointer;color:var(--vscode-button-foreground);background:var(--vscode-button-background);border:0;border-radius:5px}button:hover{background:var(--vscode-button-hoverBackground)}code{color:var(--vscode-textLink-foreground)}.note{border-left:2px solid var(--vscode-focusBorder);padding-left:16px;margin-top:28px}</style></head><body><main><small>OPENCODE IDE · RESULTS</small><h1>独立的执行结果窗口</h1><p>左侧编辑源码，此处查看真实运行结果。两个编辑组支持独立标签、滚动和拖拽调整宽度。</p><button data-action="open">打开 PDF / 图表 / 结果文件</button><button data-action="terminal">打开原生终端</button><button data-action="agent">打开右侧 OpenCode Agent</button><div class="note"><strong>LaTeX 工作流</strong><p>在左侧打开 <code>main.tex</code>，使用 LaTeX Workshop 的 Build LaTeX project 命令。生成 PDF 后，从文件树右键选择“Open in Result Group”。</p><p>当前尚未打开编译结果。构建输出、诊断和终端均来自真实插件与进程。</p></div></main><script nonce="${nonce}">const vscode=acquireVsCodeApi();vscode.setState({version:1});document.querySelectorAll('button').forEach(button=>button.onclick=()=>vscode.postMessage({action:button.dataset.action}));</script></body></html>`
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
