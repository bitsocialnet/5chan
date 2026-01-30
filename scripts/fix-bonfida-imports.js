#!/usr/bin/env node
// Fix broken ESM imports in @bonfida/spl-name-service
// The package ships with hardcoded ../node_modules/ paths that break in electron asar

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const bonfidaEsmDir = path.join(rootDir, 'node_modules/@bonfida/spl-name-service/dist/esm');
const bonfidaCjsDir = path.join(rootDir, 'node_modules/@bonfida/spl-name-service/dist/cjs');

// Map of known packages to their correct import paths
const packageMappings = {
  '@noble/hashes': (subpath) => {
    // ../node_modules/@noble/hashes/esm/sha256.js -> @noble/hashes/sha256
    if (subpath.includes('/sha256')) return '@noble/hashes/sha256';
    if (subpath.includes('/sha512')) return '@noble/hashes/sha512';
    return '@noble/hashes';
  },
  '@noble/curves': (subpath) => {
    // ../node_modules/@noble/curves/esm/ed25519.js -> @noble/curves/ed25519
    if (subpath.includes('/ed25519')) return '@noble/curves/ed25519';
    if (subpath.includes('/secp256k1')) return '@noble/curves/secp256k1';
    return '@noble/curves';
  },
  '@solana/spl-token': () => '@solana/spl-token',
  '@solana/web3.js': () => '@solana/web3.js',
  '@bonfida/sns-records': () => '@bonfida/sns-records',
  '@scure/base': () => '@scure/base',
  buffer: () => 'buffer',
  borsh: () => 'borsh',
  graphemesplit: () => 'graphemesplit',
  bs58: () => 'bs58',
  'ipaddr.js': () => 'ipaddr.js',
  punycode: () => 'punycode',
};

// Generic function to fix node_modules imports
function fixImportsInContent(content) {
  // Match patterns like from"../node_modules/PACKAGE/..." or from"./node_modules/PACKAGE/..."
  const importPattern = /from\s*["'](\.\.?\/node_modules\/((?:@[^\/]+\/[^\/]+|[^\/]+))([^"']*))["']/g;
  const sideEffectPattern = /import\s*["'](\.\.?\/node_modules\/((?:@[^\/]+\/[^\/]+|[^\/]+))([^"']*))["']/g;
  const requirePattern = /require\s*\(\s*["'](\.\.?\/node_modules\/((?:@[^\/]+\/[^\/]+|[^\/]+))([^"']*))["']\s*\)/g;

  let modified = false;

  const replaceImport = (match, fullPath, packageName, subpath) => {
    modified = true;
    const mapper = packageMappings[packageName];
    const correctImport = mapper ? mapper(subpath) : packageName;
    return `from"${correctImport}"`;
  };

  const replaceSideEffect = (match, fullPath, packageName, subpath) => {
    modified = true;
    const mapper = packageMappings[packageName];
    const correctImport = mapper ? mapper(subpath) : packageName;
    return `import"${correctImport}"`;
  };

  const replaceRequire = (match, fullPath, packageName, subpath) => {
    modified = true;
    const mapper = packageMappings[packageName];
    const correctImport = mapper ? mapper(subpath) : packageName;
    return `require("${correctImport}")`;
  };

  let result = content;
  result = result.replace(importPattern, replaceImport);
  result = result.replace(sideEffectPattern, replaceSideEffect);
  result = result.replace(requirePattern, replaceRequire);

  return { content: result, modified };
}

function fixFile(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const content = fs.readFileSync(filePath, 'utf8');
  const result = fixImportsInContent(content);

  if (result.modified) {
    fs.writeFileSync(filePath, result.content);
    return true;
  }
  return false;
}

function fixDirectory(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Directory not found: ${dir}`);
    return;
  }

  let fixedCount = 0;

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory() && entry.name !== 'node_modules') {
        walk(fullPath);
      } else if (entry.isFile() && /\.(m?js|cjs)$/.test(entry.name)) {
        if (fixFile(fullPath)) {
          fixedCount++;
        }
      }
    }
  }

  walk(dir);
  return fixedCount;
}

console.log('Fixing @bonfida/spl-name-service broken imports...');

const esmFixed = fixDirectory(bonfidaEsmDir);
const cjsFixed = fixDirectory(bonfidaCjsDir);

console.log(`Fixed ${esmFixed} ESM files and ${cjsFixed} CJS files`);

// Also remove the nested node_modules that are no longer needed
const nestedEsm = path.join(bonfidaEsmDir, 'node_modules');
const nestedCjs = path.join(bonfidaCjsDir, 'node_modules');

if (fs.existsSync(nestedEsm)) {
  fs.rmSync(nestedEsm, { recursive: true });
  console.log('Removed nested ESM node_modules');
}

if (fs.existsSync(nestedCjs)) {
  fs.rmSync(nestedCjs, { recursive: true });
  console.log('Removed nested CJS node_modules');
}

console.log('Done!');
