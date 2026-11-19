import * as vscode from "vscode"

type Project = { name: string; uri: string }

export class ProjectsProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this.changed.event

  constructor(private readonly state: vscode.Memento) {}

  async rememberWorkspace() {
    const projects = new Map(this.state.get<Project[]>("projects", []).map(p => [p.uri, p]))
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      projects.set(folder.uri.toString(), { name: folder.name, uri: folder.uri.toString() })
    }
    await this.state.update("projects", [...projects.values()].slice(-30))
    this.changed.fire()
  }

  getTreeItem(item: vscode.TreeItem) { return item }

  getChildren() {
    const folders = vscode.workspace.workspaceFolders ?? []
    return this.state.get<Project[]>("projects", []).map(project => {
      const uri = vscode.Uri.parse(project.uri)
      const active = folders.some(folder => folder.uri.toString() === project.uri)
      const item = new vscode.TreeItem(project.name, vscode.TreeItemCollapsibleState.None)
      item.resourceUri = uri
      item.iconPath = new vscode.ThemeIcon(active ? "folder-opened" : "folder")
      item.description = active ? "当前工作区" : uri.fsPath
      item.tooltip = uri.fsPath
      item.command = { command: "opencode-ide.openProject", title: "Open Project", arguments: [uri] }
      return item
    })
  }

  async add() {
    const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: "打开项目" })
    if (picked?.[0]) await vscode.commands.executeCommand("vscode.openFolder", picked[0], { forceNewWindow: false })
  }

  dispose() { this.changed.dispose() }
}
