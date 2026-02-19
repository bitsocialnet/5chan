/**
 * Provider-specific recipes for automated media upload via hidden BrowserWindow.
 * Each recipe defines selectors and behavior for DOM-based upload flows.
 * Selectors are candidate-based: try each until one matches. Fail fast on blocked indicators.
 *
 * Android vs Electron differences (documented to prevent drift):
 * - Android (MediaUploadRecipes.java): imgur/postimages only; no catbox (uses different flow).
 *   Uses WebChromeClient file chooser interception; trigger JS clicks file input.
 * - Electron: catbox/imgur/postimages. Uses CDP DOM.setFileInputFiles + submit button click.
 *   Catbox: Electron-only; keep behavior unchanged.
 * - Blocked/success selectors: reconciled with Android for imgur/postimages; Electron may add
 *   extra candidates (e.g. [data-captcha], .login-form) where DOM differs.
 * - Timeouts: imgur/postimages 45s (parity); catbox 30s (Electron-only).
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
  /* Reconciled with Android MediaUploadRecipes (imgur): file input, success extractors, blocked indicators. */
  imgur: Object.freeze({
    uploadUrl: 'https://imgur.com/upload',
    fileInputSelectorCandidates: Object.freeze(['input[type="file"]', 'input[type=file]', '[data-file-input]']),
    submitSelectorCandidates: Object.freeze(['button[type="submit"]', '[data-action="upload"]', '.upload-btn', '[type="submit"]']),
    successExtractor: Object.freeze({
      selectorCandidates: Object.freeze(['a[href*="i.imgur.com"]', 'input[value*="i.imgur.com"]', '[class*="copy-link"] input', '[data-link]']),
      attribute: 'href',
    }),
    /* Android: .signin, .login. Electron adds: [data-captcha], .login-form for DOM variations. */
    blockedIndicators: Object.freeze(['#challenge', '.captcha', '[data-captcha]', '.g-recaptcha', '#recaptcha', '.login-form', '.signin', '.login']),
    timeoutMs: 45_000,
  }),
  /* Reconciled with Android MediaUploadRecipes (postimages): file input, success extractors, blocked indicators. */
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

/**
 * Validates that every provider has required recipe fields: trigger (file input), success extractor,
 * blocked indicators, and timeout. Throws if any provider is invalid.
 */
function validateRecipes() {
  const required = ['fileInputSelectorCandidates', 'submitSelectorCandidates', 'successExtractor', 'blockedIndicators', 'timeoutMs'];
  for (const [provider, recipe] of Object.entries(MEDIA_UPLOAD_RECIPES)) {
    for (const key of required) {
      if (!(key in recipe) || recipe[key] == null) {
        throw new Error(`Recipe validation failed: ${provider} missing or null: ${key}`);
      }
    }
    const ex = recipe.successExtractor;
    if (!Array.isArray(ex?.selectorCandidates) || ex.selectorCandidates.length === 0 || !ex.attribute) {
      throw new Error(`Recipe validation failed: ${provider} successExtractor must have non-empty selectorCandidates and attribute`);
    }
    if (!Array.isArray(recipe.fileInputSelectorCandidates) || recipe.fileInputSelectorCandidates.length === 0) {
      throw new Error(`Recipe validation failed: ${provider} fileInputSelectorCandidates must be non-empty array`);
    }
    if (!Array.isArray(recipe.blockedIndicators) || recipe.blockedIndicators.length === 0) {
      throw new Error(`Recipe validation failed: ${provider} blockedIndicators must be non-empty array`);
    }
    if (typeof recipe.timeoutMs !== 'number' || recipe.timeoutMs <= 0) {
      throw new Error(`Recipe validation failed: ${provider} timeoutMs must be positive number`);
    }
  }
}

validateRecipes();

export { validateRecipes };
