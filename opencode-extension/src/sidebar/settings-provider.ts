import * as vscode from "vscode"
import { randomBytes } from "node:crypto"
import { WorkspaceManager } from "../core/workspace"
import { settingsPatch, type SettingsInput } from "./settings-form"
import { saveWorkspaceSettings } from "./settings-config"

export class OpenCodeSettingsProvider implements vscode.Disposable {
  private webview?: vscode.Webview
  private panel?: vscode.WebviewPanel
  private bag: vscode.Disposable[] = []
  private workspaceId?: string
  constructor(private mgr: WorkspaceManager) {
    this.bag.push(mgr.onDidChange(() => { void this.refresh() }))
  }
  open() {
    if (this.panel) { this.panel.reveal(vscode.ViewColumn.Active); return }
    this.panel = vscode.window.createWebviewPanel("opencode-ide-chat.settings", "OpenCode Settings", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true })
    this.attach(this.panel.webview)
    this.panel.onDidDispose(() => { this.panel = undefined; this.webview = undefined }, undefined, this.bag)
  }
  private attach(webview: vscode.Webview) {
    this.webview = webview
    webview.options = { enableScripts: true }
    webview.html = settingsHtml()
    this.bag.push(webview.onDidReceiveMessage((message: unknown) => { void this.handle(message) }))
  }
  private async refresh(workspaceId?: string) {
    const rt = this.mgr.get(workspaceId || this.workspaceId || "") ?? this.mgr.list()[0]
    this.workspaceId = rt?.workspaceId
    const workspaces = this.mgr.list().map(item => ({ id: item.workspaceId, name: item.name }))
    if (!rt?.sdk || rt.state !== "ready") {
      await this.webview?.postMessage({ type: "state", workspaces, message: "等待工作区 OpenCode 服务连接。" })
      return
    }
    try {
      const [config, providers, agents] = await Promise.all([
        rt.sdk.config.get({ directory: rt.dir }), rt.sdk.provider.list({ directory: rt.dir }), rt.sdk.app.agents({ directory: rt.dir }),
      ])
      // Only expose editable, non-secret fields to the settings webview.
      await this.webview?.postMessage({ type: "state", workspaces, workspaceId: rt.workspaceId,
        model: config.data?.model || "", smallModel: config.data?.small_model || "", agent: config.data?.default_agent || "",
        agents: (agents.data || []).filter(a => !a.hidden && a.mode !== "subagent").map(a => a.name),
        providers: (providers.data?.all || []).map(p => ({ id: p.id, name: p.name, models: Object.keys(p.models || {}), connected: providers.data?.connected.includes(p.id) })),
      })
    } catch { await this.webview?.postMessage({ type: "status", error: true, message: "无法加载设置，请检查 OpenCode 服务连接。" }) }
  }
  private async handle(message: unknown) {
    if (!message || typeof message !== "object") return
    const m = message as Record<string, unknown>
    const workspaceId = typeof m.workspaceId === "string" ? m.workspaceId : undefined
    if (m.type === "ready" || m.type === "refresh") { await this.refresh(workspaceId); return }
    if (m.type !== "restart" && m.type !== "save") return
    const rt = this.mgr.get(workspaceId || "")
    if (!rt?.sdk || rt.state !== "ready") {
      await this.webview?.postMessage({ type: "status", error: true, message: "工作区服务尚未就绪，请等待连接后重试。" })
      return
    }
    if (m.type === "restart") {
      try {
        await this.mgr.restart(rt.workspaceId)
        await this.refresh(rt.workspaceId)
      } catch { await this.webview?.postMessage({ type: "status", error: true, message: "重启失败，请查看 OpenCode UI 日志。" }) }
      return
    }
    if (m.type !== "save") return
    try {
      const input: SettingsInput = {}
      for (const key of ["model", "smallModel", "agent", "providerID", "baseURL", "customModel"] as const) {
        if (typeof m[key] === "string") input[key] = m[key]
      }
      settingsPatch(input)
      if (typeof m.apiKey === "string" && m.apiKey.trim()) {
        if (!input.providerID || !/^[a-zA-Z0-9_-]+$/.test(input.providerID)) throw new Error("请选择服务商")
        await rt.sdk.auth.set({ providerID: input.providerID, auth: { type: "api", key: m.apiKey.trim() } })
      }
      await saveWorkspaceSettings(rt.dir, input)
      await this.webview?.postMessage({ type: "status", message: "设置已保存。请在任务结束后点击“重启服务”使配置生效。API Key 保存在 OpenCode 凭据存储中。" })
    } catch {
      await this.webview?.postMessage({ type: "status", error: true, message: "保存失败：请检查模型格式、服务商 ID、API 地址和服务连接。" })
    }
  }
  dispose() {
    this.panel?.dispose()
    vscode.Disposable.from(...this.bag).dispose()
  }
}

function settingsHtml() {
  const nonce = randomBytes(16).toString("hex")
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'"><style nonce="${nonce}">
body{font:13px var(--vscode-font-family);color:var(--vscode-foreground);padding:16px;margin:0}h2{font-size:18px}fieldset{border:1px solid var(--vscode-panel-border);margin:16px 0;padding:12px}label{display:block;margin:12px 0}input,select,button{box-sizing:border-box;width:100%;padding:8px;margin-top:6px;color:var(--vscode-input-foreground);background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-panel-border))}button{cursor:pointer;background:var(--vscode-button-background);color:var(--vscode-button-foreground)}p,small{color:var(--vscode-descriptionForeground);line-height:1.6}#status{white-space:pre-wrap}#status.error{color:var(--vscode-errorForeground)}.actions{display:flex;gap:8px}</style></head><body>
<h2>OpenCode Settings</h2><p>服务商、模型及默认 Agent。模型设置保存到当前工作区；API Key 使用 OpenCode 的全局凭据存储。</p>
<label>工作区<select id="workspace"></select></label>
<form id="settings"><fieldset><legend>服务商</legend><label>服务商 ID<input id="providerID" list="providers" placeholder="openai / anthropic / my-provider"></label><datalist id="providers"></datalist><p id="connected"></p><label>API Key<input id="apiKey" type="password" autocomplete="new-password" placeholder="留空保留现有凭据"></label><label>API Base URL（可选）<input id="baseURL" type="url" placeholder="https://example.com/v1"></label><label>自定义 OpenAI-compatible 模型 ID（可选）<input id="customModel" placeholder="my-model"></label></fieldset>
<fieldset><legend>LLM 与 Agent</legend><label>默认模型<input id="model" list="models" placeholder="provider/model-id"></label><datalist id="models"></datalist><label>小模型（可选）<input id="smallModel" list="models" placeholder="provider/model-id"></label><label>默认 Agent<input id="agent" list="agents" placeholder="build"></label><datalist id="agents"></datalist></fieldset>
<button type="submit" id="save">保存设置</button></form><div class="actions"><button id="refresh">刷新</button><button id="restart">重启服务</button></div><p>重启会中断正在执行的任务；请先等待任务结束。</p><p id="status" role="status" aria-live="polite"></p>
<script nonce="${nonce}">const vscode=acquireVsCodeApi(),$=id=>document.getElementById(id);let providers=[];function send(type,extra={}){vscode.postMessage({type,workspaceId:$('workspace').value,...extra})}function list(id,values){$(id).replaceChildren(...values.map(value=>{const o=document.createElement('option');o.value=value;return o}))}window.addEventListener('message',({data:m})=>{if(m.type==='status'){$('status').textContent=m.message;$('status').className=m.error?'error':'';$('save').disabled=false;if(!m.error)$('apiKey').value='';return}if(m.type!=='state')return;providers=m.providers||[];$('workspace').replaceChildren(...m.workspaces.map(w=>{const o=document.createElement('option');o.value=w.id;o.textContent=w.name;return o}));if(m.workspaceId)$('workspace').value=m.workspaceId;for(const id of ['model','smallModel','agent'])$(id).value=m[id]||'';list('providers',providers.map(p=>p.id));list('models',providers.flatMap(p=>p.models.map(model=>p.id+'/'+model)));list('agents',m.agents||[]);$('connected').textContent='已连接：'+(providers.filter(p=>p.connected).map(p=>p.name||p.id).join(', ')||'无');$('status').textContent=m.message||''});$('settings').onsubmit=e=>{e.preventDefault();const values={};for(const id of ['model','smallModel','agent','providerID','baseURL','customModel','apiKey'])values[id]=$(id).value;$('save').disabled=true;send('save',values)};$('workspace').onchange=()=>send('refresh');$('refresh').onclick=()=>send('refresh');$('restart').onclick=()=>send('restart');send('ready');</script></body></html>`
}
