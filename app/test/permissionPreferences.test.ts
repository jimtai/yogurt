import { beforeEach, expect, it, vi } from 'vitest'
import { hookPreferences } from '../src/main/preferences'

const ipc = vi.hoisted(() => ({ handlers: new Map<string, Function>(), send: vi.fn() }))
vi.mock('electron', () => ({
  ipcMain: { handle: (name: string, handler: Function) => ipc.handlers.set(name, handler) },
  BrowserWindow: { getAllWindows: () => [{ webContents: { send: ipc.send } }] },
  nativeTheme: {},
}))

beforeEach(() => { ipc.handlers.clear(); ipc.send.mockClear() })
function rig(access: 'unknown' | 'granted') {
  const request = vi.fn().mockResolvedValue(access)
  const openSettings = vi.fn().mockResolvedValue(undefined)
  hookPreferences({
    file: '', ask: false, permissions: { request, openSettings } as unknown as Parameters<typeof hookPreferences>[0]['permissions'],
    setLogin() {}, setTrayVisible() {}, setDockVisible() {}, loginOn: () => false, macName: () => '', relaunch: () => false,
  })
  return { request, openSettings, requestPermission: ipc.handlers.get('permissions:request')! }
}

it('refreshes every window after a successful permission request without needing focus', async () => {
  const { requestPermission, openSettings } = rig('granted')
  expect(await requestPermission({}, 'mic')).toBe('granted')
  expect(openSettings).not.toHaveBeenCalled()
  expect(ipc.send).toHaveBeenCalledWith('permissions:changed')
})

it('opens Settings when macOS returns no decision, without marking access as granted', async () => {
  const { requestPermission, openSettings } = rig('unknown')
  expect(await requestPermission({}, 'systemAudio')).toBe('unknown')
  expect(openSettings).toHaveBeenCalledWith('systemAudio')
  expect(ipc.send).toHaveBeenCalledWith('permissions:changed')
})

it('rejects unknown permission names without prompting or sending a change event', async () => {
  const { requestPermission, request, openSettings } = rig('unknown')
  expect(await requestPermission({}, 'not-a-permission')).toBe('unknown')
  expect(request).not.toHaveBeenCalled()
  expect(openSettings).not.toHaveBeenCalled()
  expect(ipc.send).not.toHaveBeenCalled()
})
