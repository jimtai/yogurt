// A dedicated signing keychain avoids depending on the login keychain's password.
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') throw new Error('Local Mac builds require macOS')
const signingDir = join(homedir(), 'Library', 'Application Support', 'Yogurt Build', 'signing')
const keychain = join(signingDir, 'yogurt-build.keychain-db')
const passwordFile = join(signingDir, 'keychain-password')
const run = (command, args) => {
  try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (error) {
    // execFile's default message includes command arguments, which can include the generated keychain password.
    throw new Error(`${command} failed: ${error.stderr?.toString().trim() || 'see the macOS authorization prompt'}`)
  }
}

mkdirSync(signingDir, { recursive: true, mode: 0o700 })
chmodSync(signingDir, 0o700)
if (existsSync(keychain) !== existsSync(passwordFile)) {
  throw new Error(`Incomplete signing setup in ${signingDir}. Preserve these files and repair the existing keychain instead of replacing the signing identity.`)
}
if (!existsSync(keychain)) {
  const password = randomBytes(32).toString('base64')
  writeFileSync(passwordFile, password, { mode: 0o600 })
  run('/usr/bin/security', ['create-keychain', '-p', password, keychain])
}
chmodSync(passwordFile, 0o600)
const password = readFileSync(passwordFile, 'utf8').trim()
run('/usr/bin/security', ['unlock-keychain', '-p', password, keychain])
run('/usr/bin/security', ['set-keychain-settings', '-lut', '21600', keychain])
// codesign also searches this list when locating the private key, even with --keychain.
const searchList = [...run('/usr/bin/security', ['list-keychains', '-d', 'user']).matchAll(/"([^"]+)"/g)].map(match => match[1])
if (!searchList.includes(keychain)) run('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', ...searchList, keychain])

const temporary = mkdtempSync(join(signingDir, '.setup-'))
try {
  let certificate
  try { certificate = execFileSync('/usr/bin/security', ['find-certificate', '-c', 'Yogurt Local', '-p', keychain], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (error) { if (error.status !== 44) throw new Error('Could not inspect the existing signing certificate') }
  if (!certificate) {
    writeFileSync(join(temporary, 'certificate.conf'), `[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=extensions\n[dn]\nCN=Yogurt Local\n[extensions]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n`)
    run('openssl', ['req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-days', '3650', '-noenc', '-config', join(temporary, 'certificate.conf'), '-keyout', join(temporary, 'private.key'), '-out', join(temporary, 'certificate.pem')])
    run('openssl', ['pkcs12', '-export', '-name', 'Yogurt Local', '-inkey', join(temporary, 'private.key'), '-in', join(temporary, 'certificate.pem'), '-out', join(temporary, 'identity.p12'), '-passout', `file:${passwordFile}`, '-keypbe', 'PBE-SHA1-3DES', '-certpbe', 'PBE-SHA1-3DES', '-macalg', 'sha1'])
    run('/usr/bin/security', ['import', join(temporary, 'identity.p12'), '-k', keychain, '-f', 'pkcs12', '-P', password, '-T', '/usr/bin/codesign'])
    certificate = readFileSync(join(temporary, 'certificate.pem'), 'utf8')
  }
  // This keychain contains only the local build identity; never change ACLs on the user's login keychain.
  run('/usr/bin/security', ['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', password, keychain])
  let identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning', keychain])
  if (!identities.includes('"Yogurt Local"')) {
    writeFileSync(join(temporary, 'certificate.pem'), certificate)
    console.log('Approve macOS authorization to trust Yogurt Local for code signing only.')
    run('/usr/bin/security', ['add-trusted-cert', '-r', 'trustRoot', '-p', 'codeSign', '-k', keychain, join(temporary, 'certificate.pem')])
    identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning', keychain])
  }
  if ((identities.match(/"Yogurt Local"/g) ?? []).length !== 1) throw new Error('Expected exactly one valid Yogurt Local identity in the build keychain')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

console.log('Signing with the reusable Yogurt Local identity from the dedicated build keychain.')
const result = spawnSync('/bin/sh', [join(dirname(fileURLToPath(import.meta.url)), 'release-mac.sh')], {
  stdio: 'inherit',
  env: { ...process.env, CSC_KEYCHAIN: keychain, YOGURT_SIGN_ID: 'Yogurt Local', YOGURT_NOTARIZE: '0' },
})
if (result.error) throw result.error
process.exit(result.status ?? 1)
