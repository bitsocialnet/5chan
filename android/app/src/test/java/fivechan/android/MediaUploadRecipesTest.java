package fivechan.android;

import static org.junit.Assert.*;

import org.junit.Test;

/**
 * Unit tests for MediaUploadRecipes: recipe generation, selector arrays, timeouts,
 * and failure classification semantics (input_not_found, file_payload_unavailable,
 * blocked/captcha, upload_timed_out).
 */
public class MediaUploadRecipesTest {

    @Test
    public void timeouts_arePositive() {
        assertTrue(MediaUploadRecipes.UPLOAD_TIMEOUT_MS > 0);
        assertTrue(MediaUploadRecipes.FILE_INPUT_TIMEOUT_MS > 0);
        assertTrue(MediaUploadRecipes.POLL_INTERVAL_MS > 0);
        assertTrue(MediaUploadRecipes.TRIGGER_INITIAL_DELAY_MS > 0);
        assertTrue(MediaUploadRecipes.TRIGGER_RETRY_INTERVAL_MS > 0);
    }

    @Test
    public void uploadTimeout_exceedsFileInputTimeout() {
        assertTrue(
                MediaUploadRecipes.UPLOAD_TIMEOUT_MS > MediaUploadRecipes.FILE_INPUT_TIMEOUT_MS);
    }

    @Test
    public void getUploadUrl_imgur() {
        assertEquals(
                "https://imgur.com/upload",
                MediaUploadRecipes.getUploadUrl(MediaUploadRecipes.PROVIDER_IMGUR));
    }

    @Test
    public void getUploadUrl_unknownProvider_returnsNull() {
        assertNull(MediaUploadRecipes.getUploadUrl("catbox"));
        assertNull(MediaUploadRecipes.getUploadUrl("unknown"));
        assertNull(MediaUploadRecipes.getUploadUrl(null));
    }

    @Test
    public void getTriggerFileInputJs_imgur_containsSelectors() {
        String js = MediaUploadRecipes.getTriggerFileInputJs(MediaUploadRecipes.PROVIDER_IMGUR);
        assertNotNull(js);
        assertTrue(js.contains("input[type=\"file\"]") || js.contains("input[type=file]"));
        assertTrue(js.contains("data-file-input"));
    }

    @Test
    public void getTriggerFileInputJs_unknownProvider_returnsNull() {
        assertNull(MediaUploadRecipes.getTriggerFileInputJs("unknown"));
    }

    @Test
    public void getSubmitClickJs_imgur_returnsValidJs() {
        String js = MediaUploadRecipes.getSubmitClickJs(MediaUploadRecipes.PROVIDER_IMGUR);
        assertNotNull(js);
        assertTrue(js.contains("querySelector"));
        assertTrue(js.contains("click"));
    }

    @Test
    public void getSuccessJs_imgur_containsImgurSelectors() {
        String js = MediaUploadRecipes.getSuccessJs(MediaUploadRecipes.PROVIDER_IMGUR);
        assertNotNull(js);
        assertTrue(js.contains("i.imgur.com"));
    }

    @Test
    public void getBlockedJs_imgur_containsChallengeSelectors() {
        String js = MediaUploadRecipes.getBlockedJs(MediaUploadRecipes.PROVIDER_IMGUR);
        assertNotNull(js);
        assertTrue(js.contains("challenge") || js.contains("captcha") || js.contains("recaptcha"));
    }

    @Test
    public void failureClassification_inputNotFound_stageConstant() {
        assertEquals(MediaUploadAutomationRunner.STAGE_INPUT_NOT_FOUND, "input_not_found");
    }

    @Test
    public void failureClassification_filePayloadUnavailable_stageConstant() {
        assertEquals(
                MediaUploadAutomationRunner.STAGE_FILE_PAYLOAD_UNAVAILABLE,
                "file_payload_unavailable");
    }

    @Test
    public void failureClassification_blocked_stageConstant() {
        assertEquals(MediaUploadAutomationRunner.STAGE_BLOCKED_DETECTED, "blocked_detected");
    }

    @Test
    public void failureClassification_uploadTimedOut_stageConstant() {
        assertEquals(MediaUploadAutomationRunner.STAGE_UPLOAD_TIMED_OUT, "upload_timed_out");
    }

    @Test
    public void triggerJs_returnsSelectorOrFalse() {
        String js = MediaUploadRecipes.getTriggerFileInputJs(MediaUploadRecipes.PROVIDER_IMGUR);
        assertNotNull(js);
        assertTrue(js.contains("JSON.stringify") || js.contains("return"));
    }

}
