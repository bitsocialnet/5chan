#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const packageDistPath = path.join(__dirname, '..', 'node_modules', '@bitsocialhq', 'bitsocial-react-hooks', 'dist');
const logPrefix = '[patch-bitsocial-react-hooks-esm]';

if (!fs.existsSync(packageDistPath)) {
  console.log(`${logPrefix} Skip: @bitsocialhq/bitsocial-react-hooks dist not found.`);
  process.exit(0);
}

const relativeImportPattern = /(from\s+|import\s+)(['"])(\.\.?\/[^'"]+)\2/g;
let touchedFiles = 0;
let rewrittenImports = 0;

const splitSpecifier = (specifier) => {
  const suffixStart = specifier.search(/[?#]/);

  if (suffixStart === -1) {
    return { bareSpecifier: specifier, suffix: '' };
  }

  return {
    bareSpecifier: specifier.slice(0, suffixStart),
    suffix: specifier.slice(suffixStart),
  };
};

const resolveSpecifier = (filePath, specifier) => {
  const { bareSpecifier, suffix } = splitSpecifier(specifier);

  if (path.extname(bareSpecifier)) {
    return null;
  }

  const absoluteSpecifierPath = path.resolve(path.dirname(filePath), bareSpecifier);

  if (fs.existsSync(`${absoluteSpecifierPath}.js`)) {
    return `${bareSpecifier}.js${suffix}`;
  }

  if (fs.existsSync(path.join(absoluteSpecifierPath, 'index.js'))) {
    return `${bareSpecifier}/index.js${suffix}`;
  }

  return null;
};

const patchFile = (filePath) => {
  const source = fs.readFileSync(filePath, 'utf8');
  let fileImportCount = 0;

  const updated = source.replace(relativeImportPattern, (match, prefix, quote, specifier) => {
    const resolvedSpecifier = resolveSpecifier(filePath, specifier);

    if (!resolvedSpecifier || resolvedSpecifier === specifier) {
      return match;
    }

    fileImportCount += 1;
    return `${prefix}${quote}${resolvedSpecifier}${quote}`;
  });

  if (!fileImportCount) {
    return;
  }

  fs.writeFileSync(filePath, updated, 'utf8');
  touchedFiles += 1;
  rewrittenImports += fileImportCount;
};

const walk = (currentPath) => {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const entryPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      walk(entryPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      patchFile(entryPath);
    }
  }
};

walk(packageDistPath);

if (!touchedFiles) {
  console.log(`${logPrefix} No relative ESM imports needed patching.`);
  process.exit(0);
}

console.log(`${logPrefix} Patched ${rewrittenImports} imports across ${touchedFiles} files.`);
