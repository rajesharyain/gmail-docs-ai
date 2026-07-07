const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function notarizeMac(context) {
  if (context.electronPlatformName !== 'darwin') return

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('Skipping notarization: APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID are required.')
    return
  }

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`Submitting ${appPath} for notarization...`)

  execFileSync(
    'xcrun',
    [
      'notarytool',
      'submit',
      appPath,
      '--apple-id',
      APPLE_ID,
      '--password',
      APPLE_APP_SPECIFIC_PASSWORD,
      '--team-id',
      APPLE_TEAM_ID,
      '--wait'
    ],
    { stdio: 'inherit' }
  )

  execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' })
}
