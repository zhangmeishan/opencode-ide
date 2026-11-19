import { spawnSync } from "node:child_process"
import { codeServer } from "./common.mjs"

let missing = false
const env = { ...process.env }
for (const key of ["CODE_SERVER_PARENT_PID", "VSCODE_IPC_HOOK_CLI", "CODE_SERVER_SESSION_SOCKET", "ELECTRON_RUN_AS_NODE"]) delete env[key]
for (const [command, args, required] of [["node", ["--version"], true], ["npm", ["--version"], true], ["bun", ["--version"], true], ["python3", ["--version"], true], [codeServer, ["--version"], true], [process.env.OPENCODE_BIN || "opencode", ["--version"], true], ["latexmk", ["-v"], false], ["pdflatex", ["--version"], false]]) {
  const result = spawnSync(command, args, { encoding: "utf8", env })
  const ok = !result.error && result.status === 0
  console.log(`${ok ? "OK" : required ? "MISSING" : "OPTIONAL"} ${command}: ${ok ? result.stdout.trim().split("\n").slice(0, 3).join(" | ") : result.error?.message || result.stderr.trim()}`)
  if (!ok && required) missing = true
}
process.exitCode = missing ? 1 : 0
