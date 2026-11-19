import { execFileSync } from "node:child_process"
import path from "node:path"

// Called only with the dedicated IDE directories, after installing both new VSIX packages.
const [cli, userData, extensions] = process.argv.slice(2)
if (!cli || !userData || !extensions) throw new Error("Expected CLI, IDE user data and IDE extensions directory")
const env = { ...process.env }
for (const key of ["CODE_SERVER_PARENT_PID", "VSCODE_IPC_HOOK_CLI", "CODE_SERVER_SESSION_SOCKET", "ELECTRON_RUN_AS_NODE"]) delete env[key]
const args = ["--user-data-dir", path.resolve(userData), "--extensions-dir", path.resolve(extensions)]
const installed = execFileSync(cli, [...args, "--list-extensions"], { env, encoding: "utf8" }).toLowerCase().split(/\r?\n/).map(line => line.trim())
if (!installed.includes("opencode-ide.opencode-ide-chat") || !installed.includes("opencode-ide.opencode-ide-integration")) throw new Error("New IDE extensions must be installed before migrating the old package")
if (installed.includes("meishan.opencode-enhanced-ui")) {
  execFileSync(cli, [...args, "--uninstall-extension", "meishan.opencode-enhanced-ui"], { env, stdio: "inherit" })
}
