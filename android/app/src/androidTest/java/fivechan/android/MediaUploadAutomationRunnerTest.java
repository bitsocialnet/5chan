package fivechan.android;

import static org.junit.Assert.*;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Instrumentation tests for MediaUploadAutomationRunner against controlled HTML fixtures.
 * Uses DataTransfer injection (no chooser). Simulates: delayed DOM, missing selectors,
 * success URL extraction, blocked. Validates timeout/error classification (input_not_found,
 * blocked/captcha, upload_timed_out). Runs on emulator or device; fixtures are deterministic.
 */
@RunWith(AndroidJUnit4.class)
public class MediaUploadAutomationRunnerTest {

    private static final String FIXTURE_BASE = "file:///android_asset/fixtures/";
    private static final long TEST_TIMEOUT_SEC = 15;

    /** Minimal 1x1 PNG for fixture tests (DataTransfer injection). */
    private static final byte[] SAMPLE_FILE_BYTES =
            new byte[] {
                (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
                0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
                0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x02, 0x00, 0x00, 0x00, (byte) 0x90, 0x77, 0x53,
                (byte) 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54,
                0x08, (byte) 0xd7, 0x63, (byte) 0xf8, (byte) 0xff, (byte) 0xff, 0x3f, 0x03,
                0x00, 0x05, (byte) 0xfe, 0x02, (byte) 0xfe, (byte) 0xa8, 0x4c, 0x21,
                0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
                (byte) 0xae, 0x42, 0x60, (byte) 0x82
            };

    private Context appContext;

    @Before
    public void setUp() {
        appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    @After
    public void tearDown() {}

    private MediaUploadResult runWithFixture(String fixtureName, String provider) throws Exception {
        AtomicReference<MediaUploadResult> resultRef = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);

        String fixtureUrl = FIXTURE_BASE + fixtureName;
        MediaUploadCallback callback =
                result -> {
                    resultRef.set(result);
                    latch.countDown();
                };

        MediaUploadAutomationRunner runner =
                new MediaUploadAutomationRunner(
                        appContext,
                        SAMPLE_FILE_BYTES,
                        "sample.png",
                        "image/png",
                        provider,
                        callback,
                        fixtureUrl);

        runner.run();
        assertTrue(
                "Runner did not complete within " + TEST_TIMEOUT_SEC + "s",
                latch.await(TEST_TIMEOUT_SEC, TimeUnit.SECONDS));

        MediaUploadResult result = resultRef.get();
        assertNotNull("Callback did not receive result", result);
        return result;
    }

    @Test
    public void fixtureNoInput_triggersInputNotFound() throws Exception {
        MediaUploadResult result =
                runWithFixture("fixture_no_input.html", MediaUploadRecipes.PROVIDER_IMGUR);

        assertFalse(result.success);
        assertEquals("input_not_found", result.stage);
        assertNotNull(result.error);
        assertTrue(
                result.error.contains("File input not found")
                        || result.error.contains("input not found"));
    }

    @Test
    public void fixtureFakeTrigger_noRealInput_triggersInputNotFound() throws Exception {
        MediaUploadResult result =
                runWithFixture("fixture_fake_trigger.html", MediaUploadRecipes.PROVIDER_IMGUR);

        assertFalse(result.success);
        assertEquals("No real input[type=file] to inject into", "input_not_found", result.stage);
        assertNotNull(result.error);
        assertTrue(result.error.contains("File input not found"));
    }

    @Test
    public void fixtureBlocked_detectsBlockedCaptcha() throws Exception {
        MediaUploadResult result =
                runWithFixture("fixture_blocked.html", MediaUploadRecipes.PROVIDER_IMGUR);

        assertFalse(result.success);
        assertEquals(MediaUploadAutomationRunner.STAGE_BLOCKED_DETECTED, result.stage);
        assertNotNull(result.error);
        assertTrue(
                result.error.contains("blocked")
                        || result.error.contains("CAPTCHA")
                        || result.error.contains("rate limit"));
    }

    @Test
    public void fixtureSuccess_extractsUrlAndSucceeds() throws Exception {
        MediaUploadResult result =
                runWithFixture("fixture_success.html", MediaUploadRecipes.PROVIDER_IMGUR);

        assertTrue("Expected success, got: " + result.error, result.success);
        assertNotNull(result.url);
        assertTrue(result.url.startsWith("http"));
        assertTrue(result.url.contains("imgur"));
    }

    @Test
    public void fixtureDelayedInput_findsInputAndExtractsSuccess() throws Exception {
        MediaUploadResult result =
                runWithFixture("fixture_delayed_input.html", MediaUploadRecipes.PROVIDER_IMGUR);

        assertTrue(
                "Delayed DOM: input appears at 600ms, retries find it, success URL extracted; got stage="
                        + result.stage
                        + " error="
                        + result.error,
                result.success);
        assertNotNull(result.url);
        assertTrue(result.url.contains("imgur"));
    }

    @Test
    public void unknownProvider_returnsNoRecipe() throws Exception {
        MediaUploadResult result =
                runWithFixture("fixture_no_input.html", "unknown");

        assertFalse(result.success);
        assertEquals("no_recipe", result.stage);
    }

}
