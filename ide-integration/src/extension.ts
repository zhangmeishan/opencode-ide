import * as vscode from "vscode"
import * as path from "node:path"
import { ProjectsProvider } from "./projects"
import { Results, resultsViewType } from "./results"
import { defaultLayout, shouldInitialize } from "./layout-policy.cjs"
import { discoverSsh, syncExtensions } from "./extension-sync.cjs"

export async function activate(ctx: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel("OpenCode IDE")
  const projects = new ProjectsProvider(ctx.globalState)
  const results = new Results()
  const syncCli = process.env.OPENCODE_IDE_SYNC_CLI || vscode.workspace.getConfiguration("opencode-ide").get<string>("extensionSyncCodeCli", "")
  let syncing: Promise<void> | undefined
  let lastSync = ""
  const runExtensionSync = async (force = false) => {
    if (syncing) return syncing
    const now = Date.now()
    if (!force && now - Number(lastSync) < 5000) return
    lastSync = String(now)
    syncing = (async () => {
      const ssh = await discoverSsh()
      if (!ssh && !syncCli) { out.appendLine("[extension-sync] VS Code SSH not detected for current user"); return }
      if (ssh && syncCli) ssh.cli = syncCli
      if (ssh && process.env.OPENCODE_IDE_SSH_CODE_VERSION) ssh.version = process.env.OPENCODE_IDE_SSH_CODE_VERSION
      const result = await syncExtensions({
        webDirectory: process.env.OPENCODE_IDE_EXTENSIONS_DIR || path.resolve(ctx.globalStorageUri.fsPath, "..", "..", "..", "..", "extensions"),
        webUserData: process.env.OPENCODE_IDE_USER_DATA_DIR || path.resolve(ctx.globalStorageUri.fsPath, "..", "..", ".."),
        webCli: process.env.OPENCODE_IDE_CODE_CLI || process.env.CODE_SERVER_BIN || "code-server",
        ssh,
        stateFile: path.join(process.env.OPENCODE_IDE_DATA_DIR || path.resolve(ctx.globalStorageUri.fsPath, "..", "..", "..", ".."), "extension-sync.json"),
        log: (message: string) => out.appendLine(`[extension-sync] ${message}`),
      })
      out.appendLine(`[extension-sync] installed=${result.installed}, uninstalled=${result.uninstalled}, skipped=${result.skipped.join("; ") || "none"}`)
      if (force) void vscode.window.showInformationMessage(`扩展同步完成：安装/更新 ${result.installed}，卸载 ${result.uninstalled}${result.skipped.length ? `；跳过 ${result.skipped.length} 项` : ""}`)
    })().catch(error => out.appendLine(`[extension-sync] ${String(error)}`)).finally(() => { syncing = undefined })
    return syncing
  }
  ctx.subscriptions.push(out, projects, results,
    vscode.window.registerTreeDataProvider("opencode-ide.projectsView", projects),
    vscode.window.registerWebviewPanelSerializer(resultsViewType, results))

  function command(id: string, run: (...args: never[]) => unknown) {
    ctx.subscriptions.push(vscode.commands.registerCommand(`opencode-ide.${id}`, async (...args: never[]) => {
      try { return await run(...args) } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        out.appendLine(`${id}: ${message}`)
        await vscode.window.showErrorMessage(`OpenCode IDE: ${message}`)
      }
    }))
  }

  async function openTerminal() {
    await vscode.commands.executeCommand("workbench.action.positionPanelBottom")
    const terminal = vscode.window.terminals[0] ?? vscode.window.createTerminal({ name: "Workspace", cwd: vscode.workspace.workspaceFolders?.[0]?.uri })
    terminal.show(true)
  }

  async function openAgent() {
    await vscode.commands.executeCommand("workbench.view.extension.opencode-ide-chat-secondary.resetViewContainerLocation")
    await vscode.commands.executeCommand("opencode-ide-chat.sessionView.resetViewLocation")
    await vscode.commands.executeCommand("opencode-ide-chat.sessionView.focus")
  }

  async function restoreLayout() {
    out.appendLine("Initializing single editor and right OpenCode sidebar")
    results.close()
    await vscode.commands.executeCommand("vscode.setEditorLayout", defaultLayout())
    const candidates = await vscode.workspace.findFiles("main.tex", "**/{node_modules,.git}/**", 1)
    const source = candidates[0]
    if (source) await vscode.window.showTextDocument(source, { viewColumn: vscode.ViewColumn.One, preview: false })
    else await vscode.commands.executeCommand("workbench.action.focusFirstEditorGroup")
    await openTerminal()
    await openAgent()
    await vscode.commands.executeCommand("workbench.action.closeSidebar")
    await vscode.commands.executeCommand("workbench.action.focusFirstEditorGroup")
    await ctx.workspaceState.update("layoutVersion", 3)
    out.appendLine("Native IDE layout initialized")
  }

  command("restoreLayout", restoreLayout)
  command("openProjects", () => vscode.commands.executeCommand("opencode-ide.projectsView.focus"))
  command("addProject", () => projects.add())
  command("openProject", (uri: vscode.Uri) => vscode.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: false }))
  command("openFiles", () => vscode.commands.executeCommand("workbench.view.explorer"))
  command("openSessions", () => vscode.commands.executeCommand("opencode-ide-chat.sessions.focus"))
  command("openSearch", () => vscode.commands.executeCommand("workbench.view.search"))
  command("openGit", () => vscode.commands.executeCommand("workbench.view.scm"))
  command("openAgent", openAgent)
  command("openResult", (uri?: vscode.Uri) => results.open(uri))
  command("showResults", () => results.show())
  command("equalizeEditors", () => vscode.commands.executeCommand("workbench.action.evenEditorWidths"))
  command("openTerminal", openTerminal)
  command("syncExtensions", () => runExtensionSync(true))
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  status.text = "$(layout) OpenCode IDE"
  status.tooltip = "恢复单编辑区与右侧 OpenCode"
  status.command = "opencode-ide.restoreLayout"
  status.show()
  const syncStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  syncStatus.text = "$(sync) Extensions"
  syncStatus.tooltip = "同步 VS Code SSH 与 WebUI 中 Open VSX 可用的扩展"
  syncStatus.command = "opencode-ide.syncExtensions"
  syncStatus.show()
  ctx.subscriptions.push(syncStatus)
  ctx.subscriptions.push(status, vscode.workspace.onDidChangeWorkspaceFolders(() => { void projects.rememberWorkspace() }))
  await projects.rememberWorkspace()
  ctx.subscriptions.push(vscode.extensions.onDidChange(() => { void runExtensionSync() }))
  out.appendLine(`Activated in ${vscode.env.appName} ${vscode.version}; original Agent extension reused`)
  const enabled = vscode.workspace.getConfiguration("opencode-ide").get("initializeLayout", false)
  if (enabled) {
    const views = vscode.workspace.getConfiguration("workbench.view")
    if (!views.get("alwaysShowHeaderActions", false)) {
      await views.update("alwaysShowHeaderActions", true, vscode.ConfigurationTarget.Global)
    }
    const chat = vscode.workspace.getConfiguration("chat")
    if (!chat.get("disableAIFeatures", false)) {
      await chat.update("disableAIFeatures", true, vscode.ConfigurationTarget.Global)
    }
    if (ctx.globalState.get("openCodeTabsVersion") !== 2) {
      for (const [view, container] of [
        ["sessions", "sessions"], ["todo", "todo"], ["subagents", "subagents"], ["diff", "files"], ["sessionView", "secondary"],
      ]) {
        await vscode.commands.executeCommand(`workbench.view.extension.opencode-ide-chat-${container}.resetViewContainerLocation`)
        await vscode.commands.executeCommand(`opencode-ide-chat.${view}.resetViewLocation`)
      }
      await ctx.globalState.update("openCodeTabsVersion", 2)
    }
    await openAgent()
    await vscode.commands.executeCommand("workbench.action.closeSidebar")
  }
  if (vscode.workspace.workspaceFolders?.length && shouldInitialize(enabled, ctx.workspaceState.get("layoutVersion"))) {
    try { await restoreLayout() } catch (error) {
      out.appendLine(`Layout initialization failed: ${String(error)}`)
      await vscode.window.showErrorMessage(`OpenCode IDE layout initialization failed: ${String(error)}`)
    }
  }
  // code-server can restore files without their empty/webview editor groups.
  // Recover only missing groups; an existing native layout takes precedence.
  const saved = ctx.workspaceState.get<{ layout: unknown; source?: string; result: boolean }>("editorLayout")
  out.appendLine(`Layout enabled=${enabled}, savedResult=${saved?.result}, groups=${vscode.window.tabGroups.all.length}`)
  const sourceOpen = vscode.window.tabGroups.all.some(group => group.tabs.some(tab => tab.input instanceof vscode.TabInputText))
  if (enabled && saved?.source && !sourceOpen) {
    await vscode.commands.executeCommand("vscode.setEditorLayout", defaultLayout())
    if (saved.source) await vscode.window.showTextDocument(vscode.Uri.parse(saved.source), { viewColumn: vscode.ViewColumn.One, preview: false })
    await openTerminal()
    await openAgent()
    out.appendLine("Recovered missing result group from workspace layout")
  }
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let lastLayout = ""
  const saveLayout = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      void (async () => {
        const groups = vscode.window.tabGroups.all
        const result = groups.some(group => group.tabs.some(tab => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith(resultsViewType)))
        const source = groups[0]?.tabs.find(tab => tab.input instanceof vscode.TabInputText)?.input
        const layout = await vscode.commands.executeCommand("vscode.getEditorLayout")
        const snapshot = { layout, result, source: source instanceof vscode.TabInputText ? source.uri.toString() : undefined }
        const serialized = JSON.stringify(snapshot)
        if (serialized !== lastLayout) {
          await ctx.workspaceState.update("editorLayout", snapshot)
          lastLayout = serialized
        }
      })().catch(error => out.appendLine(`Saving layout failed: ${String(error)}`))
    }, 1000)
  }
  // Stable API has no editor sash resize event; read the native layout periodically.
  const resizeTimer = setInterval(saveLayout, 2500)
  const extensionSyncTimer = setInterval(() => { void runExtensionSync() }, 15000)
  ctx.subscriptions.push(vscode.window.tabGroups.onDidChangeTabGroups(saveLayout), vscode.window.tabGroups.onDidChangeTabs(saveLayout), { dispose: () => { clearTimeout(saveTimer); clearInterval(resizeTimer); clearInterval(extensionSyncTimer) } })
  saveLayout()
  void runExtensionSync()
}
