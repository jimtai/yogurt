// A persistent development profile, separate from the installed app's meetings and models.
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appData = process.platform === 'darwin'
  ? join(homedir(), 'Library', 'Application Support')
  : process.platform === 'win32'
    ? process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    : process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
const profile = process.env.YOGURT_USER_DATA ?? join(appData, 'Yogurt-dev')
if (!process.env.npm_execpath) throw new Error('Run this script with pnpm dev:isolated')
console.log(`Development profile: ${profile}`)
const result = spawnSync(process.execPath, [process.env.npm_execpath, '--filter', '@yogurt/app', 'dev'], {
  cwd: join(dirname(fileURLToPath(import.meta.url)), '..'),
  env: { ...process.env, YOGURT_USER_DATA: profile },
  stdio: 'inherit',
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
