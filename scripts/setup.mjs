import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { artifacts, codeServer, extensions, root, run, runtime, userData } from "./common.mjs"

await mkdir(path.join(userData, "User"), { recursive: true })
await mkdir(extensions, { recursive: true })
await readFile(path.join(runtime, "auth.json")).catch(() => run(process.execPath, [path.join(root, "scripts/configure-auth.mjs")]))
try {
  await copyFile(path.join(root, "config/settings.json"), path.join(userData, "User/settings.json"), 1)
} catch (error) { if (error.code !== "EEXIST") throw error }
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
