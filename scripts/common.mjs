import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

export const root = fileURLToPath(new URL("../", import.meta.url))
export const runtime = path.resolve(process.env.OPENCODE_IDE_DATA_DIR || path.join(root, ".runtime"))
export const userData = path.join(runtime, "user-data")
export const extensions = path.join(runtime, "extensions")
export const codeServer = process.env.CODE_SERVER_BIN || "code-server"
export const artifacts = path.join(root, "artifacts")
export function run(command, args, options = {}) {
  const env = { ...process.env }
  for (const key of ["CODE_SERVER_PARENT_PID", "VSCODE_IPC_HOOK_CLI", "CODE_SERVER_SESSION_SOCKET", "ELECTRON_RUN_AS_NODE"]) delete env[key]
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status})`)
  return result
}
export const vsce = path.join(root, "node_modules/@vscode/vsce/vsce")
