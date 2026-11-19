import { mkdir } from "node:fs/promises"
import path from "node:path"
import { build } from "esbuild"
import { artifacts, root, run, vsce } from "./common.mjs"

await mkdir(artifacts, { recursive: true })
run("bun", ["install", "--frozen-lockfile"], { cwd: path.join(root, "opencode-extension") })
run(process.execPath, [path.join(root, "node_modules/typescript/bin/tsc"), "-p", "ide-integration", "--noEmit"])
await build({ entryPoints: [path.join(root, "ide-integration/src/extension.ts")], bundle: true, platform: "node", format: "cjs", target: "node20", external: ["vscode"], outfile: path.join(root, "ide-integration/dist/extension.js") })
for (const [dir, name] of [["opencode-extension", "opencode-ide-chat"], ["ide-integration", "opencode-ide-integration"]]) {
  run(process.execPath, [vsce, "package", "--no-dependencies", "--no-update-package-json", "--allow-missing-repository", "--skip-license", "--out", path.join(artifacts, `${name}.vsix`)], { cwd: path.join(root, dir) })
}
