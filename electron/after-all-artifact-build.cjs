const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const packageJson = require('../package.json');
const rootPath = path.resolve(__dirname, '..');
const distFolderPath = path.resolve(rootPath, 'dist');

function addPortableToPortableExecutableFileName() {
  const files = fs.readdirSync(distFolderPath);
  for (const file of files) {
    if (file.endsWith('.exe') && !file.match('Setup')) {
      const filePath = path.resolve(distFolderPath, file);
      const renamedFilePath = path.resolve(distFolderPath, file.replace('5chan', '5chan Portable'));
      fs.moveSync(filePath, renamedFilePath);
    }
  }
}

function createHtmlArchive() {
  if (process.platform !== 'linux') {
    return;
  }
  const zipBinPath = path.resolve(rootPath, 'node_modules', '7zip-bin', 'linux', 'x64', '7za');
  const fivechanHtmlFolderName = `5chan-html-${packageJson.version}`;
  const outputFile = path.resolve(distFolderPath, `${fivechanHtmlFolderName}.zip`);
  // Vite outputs to 'dist', not 'build' (CRA default)
  const inputFolder = path.resolve(rootPath, 'dist');
  try {
    // Exclude Electron builder artifacts from HTML archive
    const excludes = '-xr!*.AppImage -xr!*.exe -xr!*.dmg -xr!*.blockmap -xr!*.yml -xr!*.yaml -xr!win-unpacked -xr!mac -xr!mac-arm64 -xr!linux-unpacked -xr!builder-*';
    execSync(`${zipBinPath} a ${outputFile} ${inputFolder} ${excludes}`);
    execSync(`${zipBinPath} rn -r ${outputFile} dist ${fivechanHtmlFolderName}`);
  } catch (e) {
    console.error('electron build createHtmlArchive error:', e);
  }
}

module.exports = async function afterAllArtifactBuild(buildResult) {
  addPortableToPortableExecutableFileName();
  createHtmlArchive();
};