package fivechan.android;

import static org.junit.Assert.*;

import android.content.Context;
import android.net.Uri;
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
 * Simulates: delayed DOM, missing selectors, chooser callback, success URL extraction, blocked.
 * Validates timeout/error classification (input_not_found, chooser_not_triggered, blocked/captcha,
 * upload_timed_out). Runs on emulator or device; fixtures are deterministic.
 */
@RunWith(AndroidJUnit4.class)
public class MediaUploadAutomationRunnerTest {

    private static final String FIXTURE_BASE = "file:///android_asset/fixtures/";
    private static final long TEST_TIMEOUT_SEC = 15;

    private Context appContext;
    private Uri dummyFileUri;

    @Before
    public void setUp() {
        appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        dummyFileUri = Uri.parse("content://test/sample.jpg");
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
                        dummyFileUri,
                        "sample.jpg",
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
    public void fixtureFakeTrigger_triggersChooserNotTriggered() throws Exception {
        MediaUploadResult result =
                runWithFixture("fixture_fake_trigger.html", MediaUploadRecipes.PROVIDER_IMGUR);

        assertFalse(result.success);
        assertEquals("chooser_not_triggered", result.stage);
        assertNotNull(result.error);
        assertTrue(result.error.contains("File chooser not triggered"));
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

    // --- Postimages provider tests ---

    @Test
    public void postimages_containerFirstInputLater_successUnderDelay() throws Exception {
        MediaUploadResult result =
                runWithFixture(
                        "postimages_container_first_input_later.html",
                        MediaUploadRecipes.PROVIDER_POSTIMAGES);

        assertTrue(
                "Delayed DOM: container first, input at 600ms; retries find it; got stage="
                        + result.stage
                        + " error="
                        + result.error,
                result.success);
        assertNotNull(result.url);
        assertTrue(result.url.contains("postimg"));
    }

    @Test
    public void postimages_nonInputTrap_deterministicFailureInputNotFound() throws Exception {
        MediaUploadResult result =
                runWithFixture(
                        "postimages_non_input_trap.html",
                        MediaUploadRecipes.PROVIDER_POSTIMAGES);

        assertFalse(result.success);
        assertEquals(
                "Guard must skip non-input trap; expect input_not_found not chooser_not_triggered",
                "input_not_found",
                result.stage);
        assertNotNull(result.error);
        assertTrue(
                result.error.contains("File input not found")
                        || result.error.contains("input not found"));
        assertNull(
                "Should not match trap element (non-input); matchedSelectors must be null",
                result.matchedSelectors);
    }

    @Test
    public void postimages_labelToInput_successExtractsUrl() throws Exception {
        MediaUploadResult result =
                runWithFixture(
                        "postimages_label_to_input.html",
                        MediaUploadRecipes.PROVIDER_POSTIMAGES);

        assertTrue("Label-associated input: full flow success; got " + result.error, result.success);
        assertNotNull(result.url);
        assertTrue(result.url.contains("postimg"));
    }
}
