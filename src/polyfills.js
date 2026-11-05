// Polyfills for Node.js built-ins
import { Buffer } from 'buffer';
import process from 'process';

window.Buffer = Buffer;
window.process = process;
window.global = window;

// For ethers.js
window.process.version = ''; // Fake Node.js version
window.process.env = window.process.env || {};

// Every browser, WebView and Electron renderer that runs this ES module build has fetch, so no fetch
// polyfill ships at startup. Dependencies that import node-fetch get isomorphic-fetch (the alias in
// vite.config.js), which wraps the browser's fetch.

if (typeof window.crypto === 'undefined' || typeof window.crypto.getRandomValues !== 'function') {
  throw new Error('crypto.getRandomValues is required for secure account and signature operations.');
}
