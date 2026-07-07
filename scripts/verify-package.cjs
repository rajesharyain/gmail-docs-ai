const { execFileSync } = require('child_process')
const { existsSync, statSync } = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const appPath = path.join(root, 'dist', 'mac-arm64', 'Gmail Docs AI.app')
const plist = path.join(appPath, 'Contents', 'Info.plist')
const resources = path.join(appPath, 'Contents', 'Resources')
const requiredFiles = [
  path.join(resources, 'trayTemplate.png'),
  path.join(resources, 'trayTemplate@2x.png'),
  path.join(resources, 'app.asar'),
  path.join(resources, 'sql-wasm.wasm')
]

function fail(message) {
  console.error(`Package verification failed: ${message}`)
  process.exit(1)
}

if (!existsSync(appPath)) fail(`missing ${appPath}`)
if (!existsSync(plist)) fail('missing Info.plist')
for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`missing ${path.relative(root, file)}`)
  if (statSync(file).size === 0) fail(`${path.relative(root, file)} is empty`)
}

const plistText = execFileSync('plutil', ['-p', plist], { encoding: 'utf8' })
if (!plistText.includes('"CFBundleIdentifier" => "dev.ravi.gmail-docs-ai"')) {
  fail('unexpected bundle identifier')
}
if (!plistText.includes('"LSUIElement" => true')) {
  fail('LSUIElement is not enabled')
}

console.log('Package verification passed.')
