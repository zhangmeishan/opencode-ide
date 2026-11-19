import { readFile, writeFile, chmod, mkdir } from "node:fs/promises"
import { createInterface } from "node:readline/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { hashPassword } from "./auth.mjs"
const runtime = path.resolve(process.env.OPENCODE_IDE_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".runtime"))

const file = path.join(runtime, "auth.json")
const args = process.argv.slice(2)
const fileIndex = args.indexOf("--credentials-file")
const credentialsFile = fileIndex >= 0 ? args[fileIndex + 1] : process.env.OPENCODE_IDE_CREDENTIALS_FILE
if (fileIndex >= 0 && (!credentialsFile || credentialsFile.startsWith("--"))) throw new Error("--credentials-file 需要 JSON 文件路径")
await mkdir(runtime, { recursive: true, mode: 0o700 })
if (!process.argv.includes("--reset") && !credentialsFile) {
  try { await readFile(file); await chmod(file, 0o600); process.exit(0) } catch (error) { if (error.code !== "ENOENT") throw error }
}
let username = process.env.OPENCODE_IDE_USERNAME
let password = process.env.OPENCODE_IDE_PASSWORD
if (credentialsFile) {
  let credentials
  try { credentials = JSON.parse(await readFile(path.resolve(credentialsFile), "utf8")) }
  catch { throw new Error("无法读取凭据文件：请检查路径、权限及 JSON 格式") }
  if (typeof credentials?.username !== "string" || typeof credentials?.password !== "string") throw new Error("凭据文件必须包含字符串 username 和 password")
  username = credentials.username
  password = credentials.password
  if (!username || !password) throw new Error("凭据文件中的 username 和 password 不能为空")
}
if (!username || !password) {
  if (!process.stdin.isTTY) throw new Error("首次启动需要登录账号：运行 npm run auth，或设置 OPENCODE_IDE_USERNAME 和 OPENCODE_IDE_PASSWORD")
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  username = await rl.question("WebUI 登录用户名: ")
  rl.close()
  process.stdout.write("WebUI 登录密码（至少 8 字符，输入隐藏）: ")
  password = await new Promise(resolve => {
    let value = ""
    process.stdin.setRawMode(true)
    process.stdin.resume()
    const listener = chunk => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") process.exit(130)
        if (char === "\r" || char === "\n") {
          process.stdin.off("data", listener); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); resolve(value); return
        }
        if (char === "\u007f") value = value.slice(0, -1)
        else value += char
      }
    }
    process.stdin.on("data", listener)
  })
}
if (!/^[^\s:]{1,128}$/.test(username)) throw new Error("用户名不能为空，不能包含空格或冒号")
await writeFile(file, JSON.stringify({ username, ...hashPassword(password) }, null, 2) + "\n", { mode: 0o600 })
await chmod(file, 0o600)
console.log("WebUI 登录账号已保存（仅保存加盐密码哈希）")
