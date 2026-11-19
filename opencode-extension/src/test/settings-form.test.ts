import assert from "node:assert/strict"
import { test } from "node:test"
import { settingsPatch } from "../sidebar/settings-form"

test("settings patches contain only selected model fields and preserve unrelated config", () => {
  assert.deepEqual(settingsPatch({ model: "openai/gpt-4.1", smallModel: "", agent: "build" }), {
    $schema: "https://opencode.ai/config.json", model: "openai/gpt-4.1", default_agent: "build",
  })
  assert.throws(() => settingsPatch({ model: "invalid", agent: "build" }))
})

test("custom provider settings validate URL and preserve secrets outside the config patch", () => {
  const patch = settingsPatch({ providerID: "local", baseURL: "https://models.example/v1", customModel: "my-model", model: "local/my-model" })
  assert.equal(patch.provider?.local.options?.baseURL, "https://models.example/v1")
  assert.equal(patch.provider?.local.models?.["my-model"].name, "my-model")
  assert.throws(() => settingsPatch({ providerID: "local", baseURL: "file:///tmp/key" }))
  assert.throws(() => settingsPatch({ providerID: "__proto__", baseURL: "https://example.com" }))
})
