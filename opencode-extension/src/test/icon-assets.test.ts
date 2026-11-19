import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, test } from "node:test"
import * as vscode from "vscode"

import { panelIconPath } from "../panel/provider/utils"

type ExtensionManifest = {
  icon?: string
  contributes?: {
    icons?: Record<string, { default: { fontPath: string; fontCharacter: string } }>
    viewsContainers?: {
      activitybar?: Array<{ icon?: string }>
      secondarySidebar?: Array<{ icon?: string }>
    }
    commands?: Array<{
      command?: string
      icon?: string | { light?: string; dark?: string }
    }>
  }
}

const repoRoot = process.cwd()
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
) as ExtensionManifest

function assetExists(relativePath: string) {
  return existsSync(path.join(repoRoot, relativePath))
}

describe("extension icon assets", () => {
  test("manifest icon paths all point to existing files", () => {
    const quickNewSession = manifest.contributes?.commands?.find(
      (command) => command.command === "opencode-ide-chat.quickNewSession",
    )

    const iconPaths = [
      manifest.icon,
      ...manifest.contributes?.viewsContainers?.activitybar?.map((item) => item.icon) ?? [],
      ...manifest.contributes?.viewsContainers?.secondarySidebar?.map((item) => item.icon) ?? [],
      typeof quickNewSession?.icon === "object" ? quickNewSession.icon.light : undefined,
      typeof quickNewSession?.icon === "object" ? quickNewSession.icon.dark : undefined,
    ].filter((value): value is string => Boolean(value))

    assert.ok(iconPaths.length > 0)

    for (const iconPath of iconPaths) {
      if (/^\$\([a-z0-9-]+\)$/.test(iconPath)) continue
      assert.equal(assetExists(iconPath), true, `expected asset to exist: ${iconPath}`)
    }
  })

  test("the primary OpenCode sidebar tab uses the registered font logo", () => {
    const containers = [
      ...manifest.contributes?.viewsContainers?.activitybar ?? [],
      ...manifest.contributes?.viewsContainers?.secondarySidebar ?? [],
    ]

    assert.equal(containers.length, 5)
    assert.equal(containers[0].icon, "$(opencode-ide-chat-logo)")
  })

  test("OpenCode font logo resolves to a packaged WOFF resource", () => {
    const icon = manifest.contributes?.icons?.["opencode-ide-chat-logo"]
    assert.ok(icon)
    assert.equal(icon.default.fontCharacter, "\\E001")
    const font = readFileSync(path.join(repoRoot, icon.default.fontPath))
    assert.equal(font.toString("ascii", 0, 4), "wOFF")
    assert.equal(font.readUInt32BE(8), font.length)
  })

  test("session panels use the png tab icon asset", () => {
    const iconPath = panelIconPath(vscode.Uri.file(repoRoot))
    assert.ok("fsPath" in iconPath)
    assert.equal(iconPath.fsPath, path.join(repoRoot, "images", "tab.png"))
  })
})
