import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { artifacts, codeServer, extensions, root, run, runtime, userData } from "./common.mjs"

await mkdir(path.join(userData, "User"), { recursive: true })
await mkdir(extensions, { recursive: true })
await readFile(path.join(runtime, "auth.json")).catch(() => run(process.execPath, [path.join(root, "scripts/configure-auth.mjs")]))
const settingsFile = path.join(userData, "User/settings.json")
const defaults = JSON.parse(await readFile(path.join(root, "config/settings.json"), "utf8"))
const current = JSON.parse(await readFile(settingsFile, "utf8").catch(error => {
  if (error.code !== "ENOENT") throw error
  return "{}"
}))
await writeFile(settingsFile, JSON.stringify({ ...defaults, ...current,
  "terminal.integrated.defaultLocation": "view",
  "terminal.integrated.tabs.enabled": false,
}, null, 2) + "\n", { mode: 0o600 })
try {
  await writeFile(path.join(runtime, "code-server.yaml"), "bind-addr: 127.0.0.1:3100\nauth: none\ncert: false\n", { flag: "wx", mode: 0o600 })
} catch (error) { if (error.code !== "EEXIST") throw error }
for (const name of ["opencode-ide-chat", "opencode-ide-integration"]) {
  const vsix = path.join(artifacts, `${name}.vsix`)
  await access(vsix)
  run(codeServer, ["--user-data-dir", userData, "--extensions-dir", extensions, "--install-extension", vsix, "--force"])
}
run(process.execPath, [path.join(root, "scripts/remove-legacy-chat.mjs"), codeServer, userData, extensions])
console.log(`OpenCode IDE prepared: ${runtime}`)
console.log("Default example: examples/python-demo — run python3 main.py in the workspace terminal.")
