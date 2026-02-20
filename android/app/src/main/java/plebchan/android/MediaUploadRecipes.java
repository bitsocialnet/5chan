package fivechan.android;

/**
 * Provider-specific recipes for automated media upload via WebView.
 * Reconciled with electron/media-upload-recipes.js for imgur/postimages.
 *
 * Android vs Electron (prevent drift):
 * - Android: imgur/postimages only; no catbox (uses OkHttp). Uses WebChromeClient file chooser;
 *   trigger JS clicks file input, optional submit click after chooser.
 * - Electron: catbox/imgur/postimages. CDP DOM.setFileInputFiles + submit click. Catbox Electron-only.
 * - Selectors: file input, submit, success extractor, blocked indicators kept in sync for imgur/postimages.
 * - Success extractor attribute: imgur href, postimages value (Electron parity).
 */
public final class MediaUploadRecipes {

    public static final String PROVIDER_IMGUR = "imgur";
    public static final String PROVIDER_POSTIMAGES = "postimages";

    /** Max time to wait for upload completion (ms). */
    public static final long UPLOAD_TIMEOUT_MS = 45_000;
    /** Max time to wait for provider file input to be found/triggered (ms). */
    public static final long FILE_INPUT_TIMEOUT_MS = 8_000;
    /** Poll interval for success/blocked checks (ms). */
    public static final long POLL_INTERVAL_MS = 500;
    /** Initial delay before first file-input trigger attempt (ms). SPAs may need settle time. */
    public static final long TRIGGER_INITIAL_DELAY_MS = 400;
    /** Delay between retry attempts when input not yet found (ms). */
    public static final long TRIGGER_RETRY_INTERVAL_MS = 400;

    private MediaUploadRecipes() {}

    public static String getUploadUrl(String provider) {
        if (PROVIDER_IMGUR.equals(provider)) {
            return "https://imgur.com/upload";
        }
        if (PROVIDER_POSTIMAGES.equals(provider)) {
            return "https://postimages.org";
        }
        return null;
    }

    /**
     * JS to click submit/upload button after file is selected. Optional; some providers auto-upload.
     * Returns true if a submit button was found and clicked, false otherwise. Aligns with Electron.
     */
    public static String getSubmitClickJs(String provider) {
        String[] candidates;
        if (PROVIDER_IMGUR.equals(provider)) {
            candidates =
                    new String[] {
                        "button[type=\"submit\"]",
                        "[data-action=\"upload\"]",
                        ".upload-btn",
                        "[type=\"submit\"]",
                    };
        } else if (PROVIDER_POSTIMAGES.equals(provider)) {
            candidates =
                    new String[] {
                        "button[type=\"submit\"]",
                        "[type=\"submit\"]",
                        ".btn-upload",
                    };
        } else {
            return null;
        }
        return buildSubmitClickJs(candidates);
    }

    private static String buildSubmitClickJs(String[] selectors) {
        StringBuilder sb = new StringBuilder("(function(){var s=[");
        for (int i = 0; i < selectors.length; i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(escapeJs(selectors[i])).append("\"");
        }
        sb.append(
                "];for(var i=0;i<s.length;i++){var el=document.querySelector(s[i]);if(el){el.click();return"
                        + " true;}}return false;})()");
        return sb.toString();
    }

    /**
     * JS to trigger file input click so WebChromeClient.onShowFileChooser fires.
     * Uses candidate selectors; first match wins. Returns matched selector or false.
     */
    public static String getTriggerFileInputJs(String provider) {
        String[] candidates;
        if (PROVIDER_IMGUR.equals(provider)) {
            candidates =
                    new String[] {
                        "input[type=\"file\"]",
                        "input[type=file]",
                        "[data-file-input]",
                    };
        } else if (PROVIDER_POSTIMAGES.equals(provider)) {
            candidates =
                    new String[] {
                        "input[type=\"file\"]",
                        "input[type=file]",
                        "#uploadFile",
                        ".fileinput",
                    };
        } else {
            return null;
        }
        boolean strictInputOnly = PROVIDER_POSTIMAGES.equals(provider);
        return buildTriggerFileInputJs(candidates, strictInputOnly);
    }

    /**
     * Returns matched selector string when found, false otherwise.
     * When strictInputOnly is true (postimages), only elements that are actual input[type=file]
     * are accepted, so non-input selectors do not mask delayed real inputs.
     */
    private static String buildTriggerFileInputJs(String[] selectors, boolean strictInputOnly) {
        StringBuilder sb = new StringBuilder("(function(){var s=[");
        for (int i = 0; i < selectors.length; i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(escapeJs(selectors[i])).append("\"");
        }
        String guard =
                strictInputOnly
                        ? "el&&(el.tagName==='INPUT'||el.tagName==='input')&&el.type==='file'"
                        : "el";
        sb.append(
                "];for(var i=0;i<s.length;i++){var el=document.querySelector(s[i]);if("
                        + guard
                        + "){el.click();return"
                        + " JSON.stringify(s[i]);}}return false;})()");
        return sb.toString();
    }

    /**
     * JS to extract direct media URL from page. Returns URL string or null.
     */
    public static String getSuccessJs(String provider) {
        String[] selectorCandidates;
        String attribute;
        if (PROVIDER_IMGUR.equals(provider)) {
            selectorCandidates =
                    new String[] {
                        "a[href*=\"i.imgur.com\"]",
                        "input[value*=\"i.imgur.com\"]",
                        "[class*=\"copy-link\"] input",
                        "[data-link]",
                    };
            attribute = "href";
        } else if (PROVIDER_POSTIMAGES.equals(provider)) {
            selectorCandidates =
                    new String[] {
                        "input[readonly][value*=\"postimg\"]",
                        "a[href*=\"i.postimg.cc\"]",
                        "[class*=\"direct-link\"]",
                        "textarea",
                    };
            attribute = "value";
        } else {
            return null;
        }
        return buildSuccessJs(selectorCandidates, attribute);
    }

    private static String buildSuccessJs(String[] selectors, String attr) {
        StringBuilder sb = new StringBuilder("(function(){var s=[");
        for (int i = 0; i < selectors.length; i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(escapeJs(selectors[i])).append("\"");
        }
        sb.append("];for(var i=0;i<s.length;i++){try{var el=document.querySelector(s[i]);if(!el)continue;var v=(el.value||el.getAttribute(\"value\")||\"\").trim();var h=(el.getAttribute(\"href\")||el.href||\"\").trim();var t=(el.textContent||\"\").trim();if(h&&h.indexOf(\"http\")===0)return h;if(v&&v.indexOf(\"http\")===0)return v;if(t&&t.indexOf(\"http\")===0)return t}catch(e){}}return null})()");
        return sb.toString();
    }

    /**
     * JS to detect blocked state (captcha/login/challenge). Returns true if blocked.
     */
    public static String getBlockedJs(String provider) {
        String[] blockedIndicators;
        if (PROVIDER_IMGUR.equals(provider)) {
            blockedIndicators =
                    new String[] {
                        "#challenge", ".captcha", ".g-recaptcha", "#recaptcha", ".signin", ".login",
                    };
        } else if (PROVIDER_POSTIMAGES.equals(provider)) {
            blockedIndicators =
                    new String[] {
                        "#challenge", ".captcha", ".g-recaptcha", "#recaptcha",
                    };
        } else {
            return null;
        }
        return buildBlockedJs(blockedIndicators);
    }

    private static String buildBlockedJs(String[] selectors) {
        StringBuilder sb = new StringBuilder("(function(){var s=[");
        for (int i = 0; i < selectors.length; i++) {
            if (i > 0) sb.append(",");
            sb.append("\"").append(escapeJs(selectors[i])).append("\"");
        }
        sb.append("];for(var i=0;i<s.length;i++){if(document.querySelector(s[i]))return true}return false})()");
        return sb.toString();
    }

    private static String escapeJs(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
