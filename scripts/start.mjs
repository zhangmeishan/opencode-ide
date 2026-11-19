import { access, readFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"
import { codeServer, extensions, root, runtime, userData } from "./common.mjs"
import { createAuthGateway } from "./auth.mjs"
import { hideAccounts } from "./workbench-state.mjs"

await access(path.join(runtime, "code-server.yaml"))
const workspace = path.resolve(process.argv[2] || path.join(root, "examples/latex-demo"))
await access(workspace)
const bind = process.env.OPENCODE_IDE_BIND || "127.0.0.1:3100"
const credentials = JSON.parse(await readFile(path.join(runtime, "auth.json"), "utf8").catch(() => { throw new Error("请先配置 WebUI 登录账号：npm run auth") }))
await hideAccounts(userData)
// Bind the private workbench to an ephemeral loopback port. Only the authenticated gateway is public.
const { createServer } = await import("node:net")
const probe = createServer()
await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve))
const upstreamPort = probe.address().port
await new Promise(resolve => probe.close(resolve))
const args = ["--config", path.join(runtime, "code-server.yaml"), "--auth", "none", "--bind-addr", `127.0.0.1:${upstreamPort}`, "--user-data-dir", userData, "--extensions-dir", extensions, "--disable-telemetry", "--disable-update-check", "--enable-remote-storage", "--app-name", "OpenCode IDE", workspace]
console.log(`OpenCode IDE: http://${bind}/?folder=${encodeURIComponent(workspace)}`)
const env = { ...process.env }
for (const key of ["PASSWORD", "HASHED_PASSWORD", "CODE_SERVER_PARENT_PID", "VSCODE_IPC_HOOK_CLI", "CODE_SERVER_SESSION_SOCKET", "OPENCODE_IDE_PASSWORD"]) delete env[key]
env.OPENCODE_IDE_EXTENSIONS_DIR = extensions
env.OPENCODE_IDE_USER_DATA_DIR = userData
env.OPENCODE_IDE_CODE_CLI = codeServer
const child = spawn(codeServer, args, { stdio: "inherit", env })
const gateway = createAuthGateway(credentials, upstreamPort)
const separator = bind.lastIndexOf(":")
await new Promise((resolve, reject) => { gateway.once("error", reject); gateway.listen(Number(bind.slice(separator + 1)), bind.slice(0, separator), resolve) }).catch(error => { child.kill(); throw error })
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { gateway.close(); child.kill(signal) })
child.on("error", error => { console.error(error.message); gateway.close(); process.exitCode = 1 })
child.on("exit", code => { gateway.close(); process.exitCode = code ?? 1 })
