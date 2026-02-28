package fivechan.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import androidx.core.content.FileProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Live provider integration test (emulator/device) for imgur.
 * Creates a white 100x100 PNG at runtime, then runs real WebView automation against imgur.com.
 */
@RunWith(AndroidJUnit4.class)
public class ImgurLiveUploadTest {
    private static final long TEST_TIMEOUT_SEC = 120;
    private static final String GENERATED_FILE_NAME = "white-100x100.png";

    private Context appContext;
    private Uri uploadUri;

    @Before
    public void setUp() throws Exception {
        appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        uploadUri = createWhiteSquarePngUri(appContext);
    }

    @Test
    public void imgur_liveUpload_fromGeneratedPng_succeeds() throws Exception {
        AtomicReference<MediaUploadResult> resultRef = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        MediaUploadCallback callback =
                result -> {
                    resultRef.set(result);
                    latch.countDown();
                };

        MediaUploadAutomationRunner runner =
                new MediaUploadAutomationRunner(
                        appContext,
                        uploadUri,
                        GENERATED_FILE_NAME,
                        MediaUploadRecipes.PROVIDER_IMGUR,
                        callback);

        runner.run();

        assertTrue(
                "Runner did not complete within " + TEST_TIMEOUT_SEC + "s",
                latch.await(TEST_TIMEOUT_SEC, TimeUnit.SECONDS));

        MediaUploadResult result = resultRef.get();
        assertNotNull("Callback did not receive result", result);
        assertTrue(
                "Expected live imgur upload success, got error="
                        + result.error
                        + " stage="
                        + result.stage
                        + " elapsedMs="
                        + result.elapsedMs
                        + " selector="
                        + result.matchedSelectors
                        + " retries="
                        + result.triggerRetryCount,
                result.success);
        assertNotNull("Expected uploaded URL", result.url);
        assertTrue("Expected HTTP URL, got: " + result.url, result.url.startsWith("http"));
        String normalizedUrl = result.url.toLowerCase();
        assertTrue(
                "Expected direct i.imgur.com URL, got: " + result.url,
                normalizedUrl.contains("://i.imgur.com/"));
        assertTrue(
                "Expected direct image URL with extension, got: " + result.url,
                normalizedUrl.matches(
                        "https?://i\\.imgur\\.com/.+\\.(jpg|jpeg|png|gif|webp|bmp|avif|mp4|webm)(?:[?#].*)?"));
    }

    private static Uri createWhiteSquarePngUri(Context context) throws IOException {
        File dir = new File(context.getCacheDir(), "live-upload-test");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("Unable to create cache directory: " + dir.getAbsolutePath());
        }

        File imageFile = new File(dir, GENERATED_FILE_NAME);
        Bitmap bitmap = Bitmap.createBitmap(100, 100, Bitmap.Config.ARGB_8888);
        bitmap.eraseColor(Color.WHITE);
        try (FileOutputStream fos = new FileOutputStream(imageFile)) {
            if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, fos)) {
                throw new IOException("Failed to encode generated PNG");
            }
        } finally {
            bitmap.recycle();
        }

        return FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                imageFile);
    }
}
