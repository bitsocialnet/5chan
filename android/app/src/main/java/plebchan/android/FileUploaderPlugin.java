package fivechan.android;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.appcompat.app.AppCompatActivity;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.json.JSONArray;

import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

@CapacitorPlugin(name = "FileUploader")
public class FileUploaderPlugin extends Plugin {
    private static final String TAG = "FileUploaderPlugin";

    private static final String PROVIDER_CATBOX = "catbox";
    private static final long CATBOX_TIMEOUT_SEC = 30;

    @PluginMethod
    public void pickAndUploadMedia(PluginCall call) {
        Log.d(TAG, "pickAndUploadMedia called");
        List<String> providerOrder = parseProviderOrder(call);
        if (providerOrder.isEmpty()) {
            providerOrder.add(PROVIDER_CATBOX);
        }
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
        intent.setType("*/*");
        String[] mimeTypes = {"image/jpeg", "image/png", "video/mp4", "video/webm"};
        intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
        startActivityForResult(call, intent, "pickFileResult");
    }

    private List<String> parseProviderOrder(PluginCall call) {
        List<String> order = new ArrayList<>();
        JSArray arr = call.getArray("providerOrder");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                try {
                    Object o = arr.get(i);
                    if (o instanceof String) {
                        String p = (String) o;
                        if (PROVIDER_CATBOX.equals(p)
                                || MediaUploadRecipes.PROVIDER_IMGUR.equals(p)
                                || MediaUploadRecipes.PROVIDER_POSTIMAGES.equals(p)) {
                            order.add(p);
                        }
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Skip invalid provider at " + i, e);
                }
            }
        }
        return order;
    }

    @ActivityCallback
    private void pickFileResult(PluginCall call, ActivityResult result) {
        Log.d(TAG, "pickFileResult callback received");
        if (call == null) {
            return;
        }

        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("File selection cancelled");
            return;
        }

        Intent data = result.getData();
        if (data == null) {
            call.reject("No data received");
            return;
        }

        Uri uri = data.getData();
        if (uri == null) {
            call.reject("No URI received");
            return;
        }

        List<String> providerOrder = parseProviderOrder(call);
        if (providerOrder.isEmpty()) {
            providerOrder.add(PROVIDER_CATBOX);
        }

        new Thread(
                        () -> {
                            try {
                                tryProvidersSequentially(uri, providerOrder, call);
                            } catch (Exception e) {
                                Log.e(TAG, "Upload failed", e);
                                if (!call.getData().has("_resolved")) {
                                    call.reject("Upload failed: " + e.getMessage());
                                }
                            }
                        })
                .start();
    }

    private void tryProvidersSequentially(Uri fileUri, List<String> providerOrder, PluginCall call) {
        List<JSObject> attempts = new ArrayList<>();
        StringBuilder errorSummary = new StringBuilder();

        for (String provider : providerOrder) {
            JSObject attempt = new JSObject();
            attempt.put("provider", provider);

            if (PROVIDER_CATBOX.equals(provider)) {
                MediaUploadResult res = uploadToCatboxSync(fileUri);
                attempt.put("success", res.success);
                if (res.success) {
                    attempt.put("url", res.url);
                    resolveWithSuccess(call, res.url, getFileName(fileUri), provider, attempts);
                    return;
                }
                attempt.put("error", res.error);
                errorSummary.append(provider).append(": ").append(res.error).append("; ");
            } else if (MediaUploadRecipes.PROVIDER_IMGUR.equals(provider)
                    || MediaUploadRecipes.PROVIDER_POSTIMAGES.equals(provider)) {
                MediaUploadResult res = uploadViaWebViewSync(fileUri, provider);
                attempt.put("success", res.success);
                if (res.success) {
                    attempt.put("url", res.url);
                    resolveWithSuccess(call, res.url, getFileName(fileUri), provider, attempts);
                    return;
                }
                attempt.put("error", res.error);
                errorSummary.append(provider).append(": ").append(res.error).append("; ");
            }
            attempts.add(attempt);
        }

        JSObject data = new JSObject();
        JSONArray arr = new JSONArray();
        for (JSObject a : attempts) {
            arr.put(a);
        }
        data.put("attempts", arr);
        call.reject("All providers failed: " + errorSummary.toString(), null, null, data);
    }

    private void resolveWithSuccess(
            PluginCall call, String url, String fileName, String provider, List<JSObject> attempts) {
        JSObject ret = new JSObject();
        ret.put("url", url);
        ret.put("fileName", fileName);
        ret.put("provider", provider);
        JSONArray arr = new JSONArray();
        for (JSObject a : attempts) {
            arr.put(a);
        }
        ret.put("attempts", arr);
        call.resolve(ret);
    }

    private String getFileName(Uri uri) {
        try {
            File f = FileUtils.getFileFromUri(getContext(), uri);
            return f != null ? f.getName() : "unknown";
        } catch (Exception e) {
            return "unknown";
        }
    }

    private MediaUploadResult uploadToCatboxSync(Uri fileUri) {
        try {
            File file = FileUtils.getFileFromUri(getContext(), fileUri);
            if (file == null) {
                return new MediaUploadResult(false, null, "Could not resolve file");
            }

            JSObject statusUpdate = new JSObject();
            statusUpdate.put("status", "Uploading to catbox.moe...");
            notifyListeners("uploadStatus", statusUpdate);

            OkHttpClient client =
                    new OkHttpClient.Builder()
                            .connectTimeout(CATBOX_TIMEOUT_SEC, TimeUnit.SECONDS)
                            .writeTimeout(CATBOX_TIMEOUT_SEC, TimeUnit.SECONDS)
                            .readTimeout(CATBOX_TIMEOUT_SEC, TimeUnit.SECONDS)
                            .build();

            RequestBody requestBody =
                    new MultipartBody.Builder()
                            .setType(MultipartBody.FORM)
                            .addFormDataPart("reqtype", "fileupload")
                            .addFormDataPart(
                                    "fileToUpload",
                                    file.getName(),
                                    RequestBody.create(
                                            MediaType.parse("application/octet-stream"), file))
                            .build();

            Request request =
                    new Request.Builder().url("https://catbox.moe/user/api.php").post(requestBody).build();

            try (Response response = client.newCall(request).execute()) {
                if (!response.isSuccessful()) {
                    return new MediaUploadResult(
                            false, null, "Unexpected response " + response.code());
                }
                String url = response.body().string();
                Log.d(TAG, "Catbox upload successful. URL: " + url);
                return new MediaUploadResult(true, url.trim(), null);
            }
        } catch (Exception e) {
            Log.e(TAG, "Catbox upload failed", e);
            return new MediaUploadResult(false, null, e.getMessage());
        }
    }

    private MediaUploadResult uploadViaWebViewSync(Uri fileUri, String provider) {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<MediaUploadResult> resultRef = new AtomicReference<>();

        AppCompatActivity activity = getActivity();
        if (activity == null) {
            return new MediaUploadResult(false, null, "Activity unavailable");
        }

        String fileName = getFileName(fileUri);
        MediaUploadCallback callback =
                res -> {
                    resultRef.set(res);
                    latch.countDown();
                };

        activity.runOnUiThread(
                () -> {
                    MediaUploadAutomationRunner runner =
                            new MediaUploadAutomationRunner(
                                    getContext(), fileUri, fileName, provider, callback);
                    runner.run();
                });

        try {
            boolean ok = latch.await(MediaUploadRecipes.UPLOAD_TIMEOUT_MS + 5000, TimeUnit.MILLISECONDS);
            if (!ok) {
                return new MediaUploadResult(false, null, "WebView upload timeout");
            }
            MediaUploadResult r = resultRef.get();
            return r != null ? r : new MediaUploadResult(false, null, "No result");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return new MediaUploadResult(false, null, "Interrupted");
        }
    }
}
