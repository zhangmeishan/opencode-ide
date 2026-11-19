import { execFile } from "node:child_process"
import { promisify } from "node:util"
import path from "node:path"

// Accounts visibility is profile storage, not a VS Code configuration setting.
// Apply before launching this IDE's code-server; never touch other IDE user data.
export async function hideAccounts(userData) {
  await promisify(execFile)("python3", ["-c", `import pathlib, sqlite3, sys
user = pathlib.Path(sys.argv[1]) / 'User'
profiles = [user / 'globalStorage']
if (user / 'profiles').exists():
 profiles += [p / 'globalStorage' for p in (user / 'profiles').iterdir() if p.is_dir()]
for folder in profiles:
 folder.mkdir(parents=True, exist_ok=True)
 with sqlite3.connect(folder / 'state.vscdb', timeout=10) as db:
  db.execute('CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)')
  db.execute('INSERT OR REPLACE INTO ItemTable(key,value) VALUES (?,?)', ('workbench.activity.showAccounts', 'false'))
`, path.resolve(userData)], { timeout: 15000 })
}
