import type { Client } from "../core/sdk"

export type SettingsInput = {
  model?: string
  smallModel?: string
  agent?: string
  providerID?: string
  baseURL?: string
  customModel?: string
}

export function settingsPatch(input: SettingsInput) {
  type Config = NonNullable<NonNullable<Parameters<Client["config"]["update"]>[0]>["config"]>
  const config: Config = { $schema: "https://opencode.ai/config.json" }
  for (const [field, value] of [["model", input.model], ["small_model", input.smallModel]] as const) {
    if (!value?.trim()) continue
    if (!/^[^\s/]+\/\S+$/.test(value.trim())) throw new Error("模型格式应为 provider/model-id")
    config[field] = value.trim()
  }
  if (input.agent?.trim()) config.default_agent = input.agent.trim()
  if (input.baseURL?.trim() || input.customModel?.trim()) {
    const id = input.providerID?.trim() || ""
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ["__proto__", "constructor", "prototype"].includes(id)) throw new Error("服务商 ID 无效")
    const baseURL = input.baseURL?.trim()
    if (baseURL) {
      const url = new URL(baseURL)
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("API 地址必须为 HTTP/HTTPS URL，且不包含密码")
    }
    const model = input.customModel?.trim()
    if (model && ["__proto__", "constructor", "prototype"].includes(model)) throw new Error("模型 ID 无效")
    config.provider = { [id]: {
      ...(baseURL ? { options: { baseURL } } : {}),
      ...(model ? { npm: "@ai-sdk/openai-compatible", models: { [model]: { name: model } } } : {}),
    } }
  }
  return config
}
