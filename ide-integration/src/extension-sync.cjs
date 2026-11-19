const fs = require("node:fs/promises")
const path = require("node:path")
const os = require("node:os")
const { execFile } = require("node:child_process")
const { promisify } = require("node:util")
const semver = require("semver")
const exec = promisify(execFile)
const excludedExtensions = new Set([
  "opencode-ide.opencode-ide-chat",
  "meishan.opencode-enhanced-ui",
  "opencode-ide.opencode-ide-integration",
])

function isSyncable(extension) {
  return !excludedExtensions.has(extension.id.toLowerCase())
}

function createOpenVsxLookup(fetcher = fetch, now = Date.now) {
  const cache = new Map()
  return async id => {
    id = id.toLowerCase()
    if (!/^[a-z0-9_-]+\.[a-z0-9_-]+$/.test(id)) return false
    const cached = cache.get(id)
    if (cached && cached.expires > now()) return cached.available
    const [namespace, name] = id.split(".")
    const response = await fetcher(`https://open-vsx.org/api/${namespace}/${name}`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok && response.status !== 404) throw new Error(`Open VSX 返回 ${response.status}`)
    let available = false
    if (response.ok) {
      const info = await response.json()
      if (`${info.namespace}.${info.name}`.toLowerCase() !== id || info.error) throw new Error("Open VSX 返回了无效的扩展信息")
      available = info.downloadable !== false && !!(info.files?.download || Object.keys(info.downloads || {}).length)
    }
    cache.set(id, { available, expires: now() + (available ? 60 * 60 * 1000 : 5 * 60 * 1000) })
    return available
  }
}
const availableOnOpenVSX = createOpenVsxLookup()

async function canSyncInstall(extension, lookup = availableOnOpenVSX) {
  if (!isSyncable(extension)) return false
  return lookup(extension.id.toLowerCase())
}

function planSync({ web, ssh, previous }) {
  const versions = { web: web?.version ?? null, ssh: ssh?.version ?? null }
  if (versions.web === versions.ssh) return
  let from
  if (!previous) {
    from = !web ? "ssh" : !ssh ? "web" : semver.gt(ssh.version, web.version) ? "ssh" : "web"
  } else {
    const webChanged = versions.web !== previous.web
    const sshChanged = versions.ssh !== previous.ssh
    if (!webChanged && !sshChanged) return
    if (webChanged && sshChanged) {
      from = !web ? "web" : !ssh ? "ssh" : web.timestamp >= ssh.timestamp ? "web" : "ssh"
    } else from = webChanged ? "web" : "ssh"
  }
  return { from, to: from === "web" ? "ssh" : "web", action: versions[from] === null ? "uninstall" : "install" }
}

async function inventory(directory) {
  let entries
  try { entries = JSON.parse(await fs.readFile(path.join(directory, "extensions.json"), "utf8")) }
  catch (error) { throw new Error(`无法读取扩展清单 ${directory}: ${error.message}`) }
  const extensions = new Map()
  for (const entry of entries) {
    const location = entry.relativeLocation
    if (!location || path.basename(location) !== location) continue
    const dir = path.join(directory, location)
    let manifest
    try { manifest = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf8")) }
    catch (error) { throw new Error(`扩展正在变化或不可读取 ${dir}: ${error.message}`) }
    const extension = { id: `${manifest.publisher}.${manifest.name}`.toLowerCase(), publisher: manifest.publisher || "", version: manifest.version, timestamp: entry.metadata?.installedTimestamp || 0, engines: manifest.engines, dir }
    if (isSyncable(extension)) extensions.set(extension.id, extension)
  }
  return extensions
}

function cleanEnv() {
  const env = { ...process.env }
  for (const key of ["CODE_SERVER_PARENT_PID", "VSCODE_IPC_HOOK_CLI", "CODE_SERVER_SESSION_SOCKET", "ELECTRON_RUN_AS_NODE"]) delete env[key]
  return env
}

async function cliVersion(cli) {
  const { stdout } = await exec(cli, ["--version"], { env: cleanEnv(), timeout: 15000 })
  const version = stdout.match(/\b1\.\d+\.\d+\b/)?.[0]
  if (!version) throw new Error(`无法识别扩展安装器版本：${cli}`)
  return version
}

async function discoverSsh() {
  const root = process.env.VSCODE_AGENT_FOLDER || path.join(os.homedir(), ".vscode-server")
  const directory = path.join(root, "extensions")
  const candidates = []
  for (const parent of [path.join(root, "cli/servers"), path.join(root, "bin")]) {
    let entries
    try { entries = await fs.readdir(parent) } catch (error) { if (error.code === "ENOENT") continue; throw error }
    for (const entry of entries) {
      const cli = path.join(parent, entry, parent.endsWith("servers") ? "server/bin/code-server" : "bin/code-server")
      try { const stat = await fs.stat(cli); candidates.push({ cli, time: stat.mtimeMs }) } catch {}
    }
  }
  candidates.sort((a, b) => b.time - a.time)
  for (const candidate of candidates) try { return { directory, cli: candidate.cli, version: await cliVersion(candidate.cli) } } catch {}
  const cli = process.env.VSCODE_AGENT_CLI || process.env.OPENCODE_IDE_SYNC_CLI
  if (cli) return { directory, cli, version: await cliVersion(cli) }
}

// Build a VSIX with Python's standard ZIP library; both hosts then use their own installer.
async function packageExtension(extension, output) {
  await exec("python3", ["-c", `import json,pathlib,sys,zipfile,xml.sax.saxutils as x
root=pathlib.Path(sys.argv[1]); m=json.loads((root/'package.json').read_text()); esc=lambda s:x.escape(str(s), {'"':'&quot;'})
manifest='<?xml version="1.0"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="'+esc(m['name'])+'" Version="'+esc(m['version'])+'" Publisher="'+esc(m['publisher'])+'"/><DisplayName>'+esc(m.get('displayName',m['name']))+'</DisplayName><Description xml:space="preserve">'+esc(m.get('description',''))+'</Description><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="'+esc(m['engines']['vscode'])+'"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="'+esc(','.join(m.get('extensionDependencies',[])))+'"/></Properties></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>'
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as z:
 z.writestr('extension.vsixmanifest',manifest)
 extensions={f.suffix.lstrip('.') for f in root.rglob('*') if f.is_file() and not f.is_symlink()}; mime={'.json':'application/json','.xml':'text/xml','.png':'image/png','.svg':'image/svg+xml','.js':'application/javascript','.css':'text/css','.html':'text/html','.md':'text/plain','.txt':'text/plain','.woff':'font/woff','.woff2':'font/woff2'}
 defaults=''.join('<Default Extension="'+x+'" ContentType="'+mime.get('.'+x,'application/octet-stream')+'"/>' for x in extensions)
 z.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="vsixmanifest" ContentType="text/xml"/>'+defaults+'</Types>')
 for f in root.rglob('*'):
  if f.is_file() and not f.is_symlink():z.write(f,'extension/'+str(f.relative_to(root)))
`, extension.dir, output], { timeout: 120000, env: cleanEnv() })
}

async function syncExtensions(options) {
  await fs.mkdir(path.dirname(options.stateFile), { recursive: true })
  const lock = `${options.stateFile}.lock`
  let handle
  try { handle = await fs.open(lock, "wx", 0o600) }
  catch (error) {
    if (error.code !== "EEXIST") throw error
    // Recover locks left behind by an extension host that has exited.
    const pid = Number(await fs.readFile(lock, "utf8"))
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0) } catch (error) {
        if (error.code === "ESRCH") { await fs.unlink(lock); return syncExtensions(options) }
      }
    }
    return { installed: 0, uninstalled: 0, skipped: ["另一个窗口正在同步扩展"] }
  }
  try {
    await handle.writeFile(String(process.pid))
    return await syncUnlocked(options)
  } finally {
    await handle.close()
    await fs.unlink(lock)
  }
}

async function syncUnlocked(options) {
  const { webDirectory, webCli, stateFile, log } = options
  const ssh = options.ssh || await discoverSsh()
  if (!ssh) return { installed: 0, uninstalled: 0, skipped: ["未检测到当前用户的 VS Code SSH 安装"] }
  const webVersion = await cliVersion(webCli)
  const hosts = { web: { directory: webDirectory, cli: webCli, version: webVersion }, ssh }
  const inventories = { web: await inventory(webDirectory), ssh: await inventory(ssh.directory) }
  let state = { entries: {} }
  try { state = JSON.parse(await fs.readFile(stateFile, "utf8")) } catch (error) { if (error.code !== "ENOENT") throw error }
  const report = { installed: 0, uninstalled: 0, skipped: [] }
  const ids = new Set([...inventories.web.keys(), ...inventories.ssh.keys(), ...Object.keys(state.entries)])
  for (const id of ids) {
    if (excludedExtensions.has(id.toLowerCase())) continue
    const web = inventories.web.get(id)
    const remote = inventories.ssh.get(id)
    const previous = state.entries[id]
    // Keep unlisted/unreachable entries out of the synchronized baseline as well as mutations.
    // For a deletion, the remaining copy supplies the extension identity.
    if (!web && !remote) {
      if (previous) state.entries[id] = { web: null, ssh: null }
      continue
    }
    try {
      if (!await canSyncInstall(web || remote, options.openVsxLookup || availableOnOpenVSX)) {
        report.skipped.push(`${id}: Open VSX 未提供可下载的扩展`)
        continue
      }
    } catch (error) {
      report.skipped.push(`${id}: 无法确认 Open VSX 收录状态：${error.message}`)
      continue
    }
    if (!previous && web?.version === remote?.version) {
      state.entries[id] = { web: web?.version ?? null, ssh: remote?.version ?? null }
      continue
    }
    const plan = planSync({ web, ssh: remote, previous })
    if (!plan) {
      if (web?.version === remote?.version || !previous) state.entries[id] = { web: web?.version ?? null, ssh: remote?.version ?? null }
      continue
    }
    const target = hosts[plan.to]
    const source = inventories[plan.from].get(id)
    if (source && !semver.satisfies(target.version, source.engines?.vscode || "*")) { report.skipped.push(`${id}: 目标 VS Code ${target.version} 不满足 ${source.engines?.vscode}`); continue }
    // Do not let the installer pull unchecked dependencies from another gallery.
    if (source) {
      const manifest = JSON.parse(await fs.readFile(path.join(source.dir, "package.json"), "utf8"))
      const missing = [...(manifest.extensionDependencies || []), ...(manifest.extensionPack || [])].filter(dep => !inventories[plan.to].has(dep.toLowerCase()))
      if (missing.length) { report.skipped.push(`${id}: 目标缺少不参与同步的依赖 ${missing.join(", ")}`); continue }
    }
    let temp
    try {
      const args = ["--extensions-dir", target.directory]
      if (plan.to === "web") args.push("--user-data-dir", options.webUserData)
      if (plan.action === "install") {
        temp = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-ide-sync-"))
        const vsix = path.join(temp, "extension.vsix")
        await packageExtension(source, vsix)
        args.push("--install-extension", vsix, "--force")
      } else args.push("--uninstall-extension", id)
      await exec(target.cli, args, { env: cleanEnv(), timeout: 120000, maxBuffer: 2 * 1024 * 1024 })
      const after = await inventory(target.directory)
      if ((after.get(id)?.version ?? null) !== (source?.version ?? null)) throw new Error("安装器返回后版本未匹配")
      inventories[plan.to] = after
      state.entries[id] = { web: inventories.web.get(id)?.version ?? null, ssh: inventories.ssh.get(id)?.version ?? null }
      report[plan.action === "install" ? "installed" : "uninstalled"]++
      log(`${plan.from} → ${plan.to}: ${plan.action} ${id}${source ? `@${source.version}` : ""}`)
    } catch (error) {
      report.skipped.push(`${id}: ${error.message}`)
    } finally { if (temp) await fs.rm(temp, { recursive: true, force: true }) }
  }
  await fs.mkdir(path.dirname(stateFile), { recursive: true })
  const temp = `${stateFile}.${process.pid}.tmp`
  await fs.writeFile(temp, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 })
  await fs.rename(temp, stateFile)
  return report
}

module.exports = { createOpenVsxLookup, availableOnOpenVSX, canSyncInstall, discoverSsh, isSyncable, planSync, inventory, packageExtension, syncExtensions }
