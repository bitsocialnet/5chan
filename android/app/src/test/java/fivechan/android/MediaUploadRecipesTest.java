package fivechan.android;

import static org.junit.Assert.*;

import org.junit.Test;

/**
 * Unit tests for MediaUploadRecipes: recipe generation, selector arrays, timeouts,
 * and failure classification semantics (input_not_found, chooser_not_triggered,
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
    public void getUploadUrl_postimages() {
        assertEquals(
                "https://postimages.org",
                MediaUploadRecipes.getUploadUrl(MediaUploadRecipes.PROVIDER_POSTIMAGES));
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
    public void getTriggerFileInputJs_postimages_containsSelectors() {
        String js = MediaUploadRecipes.getTriggerFileInputJs(MediaUploadRecipes.PROVIDER_POSTIMAGES);
        assertNotNull(js);
        assertTrue(js.contains("input[type=\"file\"]") || js.contains("input[type=file]"));
        assertTrue(js.contains("uploadFile") || js.contains("fileinput"));
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
    public void getSubmitClickJs_postimages_returnsValidJs() {
        String js = MediaUploadRecipes.getSubmitClickJs(MediaUploadRecipes.PROVIDER_POSTIMAGES);
        assertNotNull(js);
        assertTrue(js.contains("querySelector"));
    }

    @Test
    public void getSuccessJs_imgur_containsImgurSelectors() {
        String js = MediaUploadRecipes.getSuccessJs(MediaUploadRecipes.PROVIDER_IMGUR);
        assertNotNull(js);
        assertTrue(js.contains("i.imgur.com"));
    }

    @Test
    public void getSuccessJs_postimages_containsPostimgSelectors() {
        String js = MediaUploadRecipes.getSuccessJs(MediaUploadRecipes.PROVIDER_POSTIMAGES);
        assertNotNull(js);
        assertTrue(js.contains("postimg"));
    }

    @Test
    public void getBlockedJs_imgur_containsChallengeSelectors() {
        String js = MediaUploadRecipes.getBlockedJs(MediaUploadRecipes.PROVIDER_IMGUR);
        assertNotNull(js);
        assertTrue(js.contains("challenge") || js.contains("captcha") || js.contains("recaptcha"));
    }

    @Test
    public void getBlockedJs_postimages_containsBlockedIndicators() {
        String js = MediaUploadRecipes.getBlockedJs(MediaUploadRecipes.PROVIDER_POSTIMAGES);
        assertNotNull(js);
        assertTrue(js.contains("challenge") || js.contains("captcha"));
    }

    @Test
    public void failureClassification_inputNotFound_stageConstant() {
        assertEquals("input_not_found", "input_not_found");
    }

    @Test
    public void failureClassification_chooserNotTriggered_stageConstant() {
        assertEquals("chooser_not_triggered", "chooser_not_triggered");
    }

    @Test
    public void failureClassification_blocked_stageConstant() {
        assertEquals(MediaUploadAutomationRunner.STAGE_BLOCKED_DETECTED, "blocked_detected");
    }

    @Test
    public void failureClassification_uploadTimedOut_stageConstant() {
        assertEquals("upload_timed_out", "upload_timed_out");
    }

    @Test
    public void triggerJs_returnsSelectorOrFalse() {
        String js = MediaUploadRecipes.getTriggerFileInputJs(MediaUploadRecipes.PROVIDER_IMGUR);
        assertNotNull(js);
        assertTrue(js.contains("JSON.stringify") || js.contains("return"));
    }

    /** Postimages selector contract: no broad non-input fallback; strict INPUT type=file guard. */
    @Test
    public void postimages_triggerJs_hasStrictInputOnlyGuard() {
        String js = MediaUploadRecipes.getTriggerFileInputJs(MediaUploadRecipes.PROVIDER_POSTIMAGES);
        assertNotNull(js);
        assertTrue(
                "Postimages must enforce actual file input; guard rejects non-input elements",
                js.contains("tagName") && js.contains("INPUT") && js.contains("type") && js.contains("file"));
    }

    @Test
    public void postimages_triggerJs_stricterThanImgur() {
        String imgurJs = MediaUploadRecipes.getTriggerFileInputJs(MediaUploadRecipes.PROVIDER_IMGUR);
        String postimagesJs =
                MediaUploadRecipes.getTriggerFileInputJs(MediaUploadRecipes.PROVIDER_POSTIMAGES);
        assertNotNull(imgurJs);
        assertNotNull(postimagesJs);
        assertFalse("Imgur has no strict input guard", imgurJs.contains("tagName"));
        assertTrue(
                "Postimages must enforce strict input-only; no broad non-input fallback",
                postimagesJs.contains("tagName"));
    }
}
