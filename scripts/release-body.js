import {execSync} from 'child_process'
import path from 'path'
import {fileURLToPath} from 'url'
import {readFileSync} from 'fs'

const dirname = path.join(path.dirname(fileURLToPath(import.meta.url)))
const conventionalChangelog = path.join(dirname, '..', 'node_modules', '.bin', 'conventional-changelog')
const packageJsonPath = path.join(dirname, '..', 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const version = packageJson.version

// sometimes release-count 1 is empty
let releaseChangelog = 
  execSync(`${conventionalChangelog} --preset angular --release-count 1`).toString() || 
  execSync(`${conventionalChangelog} --preset angular --release-count 2`).toString()

// format
releaseChangelog = releaseChangelog.trim().replace(/\n\n+/g, '\n\n')

const releaseBody = `This version rebrands the app to 5chan, introducing a set of new features and several performance improvements.

- Web app: https://5chan.app
- Decentralized web app: https://5chan.eth (only works on [Brave Browser](https://brave.com/) or via [IPFS Companion](https://docs.ipfs.tech/install/ipfs-companion/#prerequisites))

## Downloads

- Android app: [Download APK](https://github.com/plebbit/5chan/releases/download/v${version}/5chan-${version}.apk)
- Linux app: [Download AppImage](https://github.com/plebbit/5chan/releases/download/v${version}/5chan-${version}.AppImage)
- macOS app: [Download DMG](https://github.com/plebbit/5chan/releases/download/v${version}/5chan-${version}.dmg)
- Windows app: [Download EXE](https://github.com/plebbit/5chan/releases/download/v${version}/5chan.Setup.${version}.exe)

${releaseChangelog}`

console.log(releaseBody)