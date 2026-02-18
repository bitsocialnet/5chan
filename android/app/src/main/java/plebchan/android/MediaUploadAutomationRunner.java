package fivechan.android;

import android.annotation.SuppressLint;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Result of a WebView-based upload attempt. */
final class MediaUploadResult {
    public final boolean success;
    public final String url;
    public final String error;

    public MediaUploadResult(boolean success, String url, String error) {
        this.success = success;
        this.url = url;
        this.error = error;
    }
}

/** Callback for MediaUploadAutomationRunner. */
interface MediaUploadCallback {
    void onComplete(MediaUploadResult result);
}

/**
 * Non-interactive WebView automation for imgur/postimages uploads.
 * Intercepts file chooser, feeds selected URI, polls for success/blocked, then tears down.
 */
@SuppressLint("SetJavaScriptEnabled")
public class MediaUploadAutomationRunner {
    private static final String TAG = "MediaUploadAutomation";

    private final Context context;
    private final Uri fileUri;
    private final String fileName;
    private final String provider;
    private final MediaUploadCallback callback;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private final Handler mainHandler;
    private final Runnable pollRunnable;
    private boolean finished;
    private long startTime;

    public MediaUploadAutomationRunner(
            Context context, Uri fileUri, String fileName, String provider, MediaUploadCallback callback) {
        this.context = context.getApplicationContext();
        this.fileUri = fileUri;
        this.fileName = fileName;
        this.provider = provider;
        this.callback = callback;
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.pollRunnable = this::pollForResult;
    }

    public void run() {
        mainHandler.post(this::startWebView);
    }

    private void startWebView() {
        webView = new WebView(context);
        webView.setVisibility(android.view.View.GONE);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setUserAgentString(
                "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36");

        webView.setWebChromeClient(
                new WebChromeClient() {
                    @Override
                    public boolean onShowFileChooser(
                            WebView webView,
                            ValueCallback<Uri[]> filePathCallback,
                            FileChooserParams fileChooserParams) {
                        MediaUploadAutomationRunner.this.filePathCallback = filePathCallback;
                        if (fileUri != null) {
                            filePathCallback.onReceiveValue(new Uri[] {fileUri});
                            MediaUploadAutomationRunner.this.filePathCallback = null;
                        }
                        return true;
                    }
                });

        webView.setWebViewClient(
                new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        MediaUploadAutomationRunner.this.mainHandler.postDelayed(
                                MediaUploadAutomationRunner.this::triggerFileInput, 1500);
                    }
                });

        String uploadUrl = MediaUploadRecipes.getUploadUrl(provider);
        if (uploadUrl == null) {
            finish(new MediaUploadResult(false, null, "Unknown provider: " + provider));
            return;
        }
        startTime = System.currentTimeMillis();
        webView.loadUrl(uploadUrl);
        Log.d(TAG, "Loaded " + uploadUrl + " for provider " + provider);
    }

    private void triggerFileInput() {
        String js = MediaUploadRecipes.getTriggerFileInputJs(provider);
        if (js == null) {
            finish(new MediaUploadResult(false, null, "No trigger JS for " + provider));
            return;
        }
        webView.evaluateJavascript(js, value -> schedulePoll());
    }

    private void schedulePoll() {
        mainHandler.removeCallbacks(pollRunnable);
        mainHandler.postDelayed(pollRunnable, MediaUploadRecipes.POLL_INTERVAL_MS);
    }

    private void pollForResult() {
        if (finished) return;

        long elapsed = System.currentTimeMillis() - startTime;
        if (elapsed >= MediaUploadRecipes.UPLOAD_TIMEOUT_MS) {
            finish(new MediaUploadResult(false, null, "Upload timeout"));
            return;
        }

        String successJs = MediaUploadRecipes.getSuccessJs(provider);
        String blockedJs = MediaUploadRecipes.getBlockedJs(provider);
        if (successJs == null || blockedJs == null) {
            finish(new MediaUploadResult(false, null, "Missing recipe for " + provider));
            return;
        }

        webView.evaluateJavascript(
                blockedJs,
                blocked -> {
                    if ("true".equals(blocked)) {
                        finish(new MediaUploadResult(false, null, "Provider blocked (CAPTCHA/rate limit)"));
                        return;
                    }
                    webView.evaluateJavascript(
                            successJs,
                            url -> {
                                if (url != null && !"null".equals(url) && url.length() > 2) {
                                    String cleaned = url.replaceAll("^\"|\"$", "").replace("\\u003d", "=");
                                    if (cleaned.startsWith("http")) {
                                        finish(new MediaUploadResult(true, cleaned, null));
                                        return;
                                    }
                                }
                                schedulePoll();
                            });
                });
    }

    private void finish(MediaUploadResult result) {
        if (finished) return;
        finished = true;
        mainHandler.removeCallbacks(pollRunnable);
        if (filePathCallback != null) {
            try {
                filePathCallback.onReceiveValue(null);
            } catch (Exception ignored) {}
            filePathCallback = null;
        }
        tearDown();
        callback.onComplete(result);
    }

    private void tearDown() {
        mainHandler.post(
                () -> {
                    if (webView != null) {
                        try {
                            webView.stopLoading();
                            webView.clearHistory();
                            webView.clearCache(true);
                            webView.clearSslPreferences();
                            webView.destroy();
                        } catch (Exception e) {
                            Log.w(TAG, "Teardown warning", e);
                        }
                        webView = null;
                    }
                });
    }
}
