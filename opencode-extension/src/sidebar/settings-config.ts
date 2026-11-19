import * as fs from "node:fs/promises"
import path from "node:path"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import type { SettingsInput } from "./settings-form"
import { settingsPatch } from "./settings-form"

export async function saveWorkspaceSettings(dir: string, input: SettingsInput) {
  const patch = settingsPatch(input)
  // Match OpenCode's project precedence while preserving JSONC comments and all other keys.
  const jsonc = path.join(dir, "opencode.jsonc")
  const json = path.join(dir, "opencode.json")
  const file = await fs.access(jsonc).then(() => jsonc, () => json)
  const before = await fs.readFile(file, "utf8").catch(error => {
    if (error.code === "ENOENT") return "{}\n"
    throw error
  })
  const errors: ParseError[] = []
  const config = parse(before, errors, { allowTrailingComma: true })
  if (errors.length || !config || typeof config !== "object" || Array.isArray(config)) throw new Error("现有 OpenCode 配置不是有效 JSON/JSONC")
  let text = before
  const set = (keys: string[], value: unknown) => {
    text = applyEdits(text, modify(text, keys, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }))
  }
  set(["$schema"], "https://opencode.ai/config.json")
  for (const key of ["model", "small_model", "default_agent"] as const) if (patch[key]) set([key], patch[key])
  for (const [id, provider] of Object.entries(patch.provider || {})) {
    if (provider.npm && !config.provider?.[id]?.npm) set(["provider", id, "npm"], provider.npm)
    if (provider.options?.baseURL) set(["provider", id, "options", "baseURL"], provider.options.baseURL)
    for (const [model, value] of Object.entries(provider.models || {})) set(["provider", id, "models", model, "name"], value.name)
  }
  // Reject concurrent editor changes instead of overwriting them.
  const current = await fs.readFile(file, "utf8").catch(error => { if (error.code === "ENOENT") return "{}\n"; throw error })
  if (current !== before) throw new Error("配置已被其他窗口修改，请刷新后重试")
  await fs.writeFile(file, text, { mode: 0o600 })
  return file
}
