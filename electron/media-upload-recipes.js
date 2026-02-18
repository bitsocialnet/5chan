/**
 * Provider-specific recipes for automated media upload via hidden BrowserWindow.
 * Each recipe defines selectors and behavior for DOM-based upload flows.
 * Selectors are candidate-based: try each until one matches. Fail fast on blocked indicators.
 *
 * @typedef {Object} ProviderRecipe
 * @property {string} uploadUrl - Full URL of the provider's upload page
 * @property {readonly string[]} fileInputSelectorCandidates - CSS selectors for file input (first match wins)
 * @property {readonly string[]} submitSelectorCandidates - CSS selectors for submit/upload button
 * @property {Object} successExtractor - How to extract the result URL from the page
 * @property {readonly string[]} successExtractor.selectorCandidates - Selectors for element containing result URL
 * @property {'href'|'src'|'value'|'text'} successExtractor.attribute - Attribute or 'text' for textContent
 * @property {readonly string[]} blockedIndicators - Selectors that indicate captcha/login/challenge (fail immediately if present)
 * @property {number} timeoutMs - Max time to wait for upload completion
 */

/** @type {Readonly<Record<string, ProviderRecipe>>} */
export const MEDIA_UPLOAD_RECIPES = Object.freeze({
  catbox: Object.freeze({
    uploadUrl: 'https://catbox.moe',
    fileInputSelectorCandidates: Object.freeze(['input[type="file"]', 'input[type=file]']),
    submitSelectorCandidates: Object.freeze(['button[type="submit"]', 'input[type="submit"]', '[type="submit"]']),
    successExtractor: Object.freeze({
      selectorCandidates: Object.freeze(['a[href*="files.catbox.moe"]', 'input[value*="files.catbox.moe"]', '[class*="result"] a', 'textarea']),
      attribute: 'href',
    }),
    blockedIndicators: Object.freeze(['#challenge', '.captcha', '[data-captcha]', '.g-recaptcha', '.login-form', '#recaptcha']),
    timeoutMs: 30_000,
  }),
  imgur: Object.freeze({
    uploadUrl: 'https://imgur.com/upload',
    fileInputSelectorCandidates: Object.freeze(['input[type="file"]', 'input[type=file]', '[data-file-input]']),
    submitSelectorCandidates: Object.freeze(['button[type="submit"]', '[data-action="upload"]', '.upload-btn', '[type="submit"]']),
    successExtractor: Object.freeze({
      selectorCandidates: Object.freeze(['a[href*="i.imgur.com"]', 'input[value*="i.imgur.com"]', '[class*="copy-link"] input', '[data-link]']),
      attribute: 'href',
    }),
    blockedIndicators: Object.freeze(['#challenge', '.captcha', '.g-recaptcha', '#recaptcha', '.signin', '.login']),
    timeoutMs: 45_000,
  }),
  postimages: Object.freeze({
    uploadUrl: 'https://postimages.org',
    fileInputSelectorCandidates: Object.freeze(['input[type="file"]', 'input[type=file]', '#uploadFile', '.fileinput']),
    submitSelectorCandidates: Object.freeze(['button[type="submit"]', '[type="submit"]', '.btn-upload']),
    successExtractor: Object.freeze({
      selectorCandidates: Object.freeze(['input[readonly][value*="postimg"]', 'a[href*="i.postimg.cc"]', '[class*="direct-link"]', 'textarea']),
      attribute: 'value',
    }),
    blockedIndicators: Object.freeze(['#challenge', '.captcha', '.g-recaptcha', '#recaptcha']),
    timeoutMs: 45_000,
  }),
});
