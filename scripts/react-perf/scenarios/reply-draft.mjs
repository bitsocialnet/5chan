import assert from 'node:assert/strict';
import { waitForAccountReady } from './account-ready.mjs';

export default {
  name: 'reply-draft-isolation',
  path: '/#/subs',
  async prepare({ page }) {
    await page.addInitScript(() => localStorage.setItem('5chan-interface-language', 'en'));
  },
  async run({ page, measure }) {
    await page.getByText('You have not subscribed to any board yet.', { exact: true }).waitFor();
    await waitForAccountReady(page);
    // Open a local draft through the real store; no publish action is invoked.
    await page.evaluate(async () => {
      const { default: store } = await import('/src/stores/use-reply-modal-store.ts');
      store.getState().openReplyModalEmpty('/subs', 'benchmark-root', 1, 'music-posting.eth');
    });
    const input = page.locator('[aria-labelledby="reply-modal-title"] textarea');
    await input.waitFor({ timeout: 10000 });
    await input.fill('');
    const budget = { components: { GlobalLayout: { maxUpdates: 0 } }, maxCommits: 50, maxRenderMs: 3000, maxActionMs: 10000 };
    try {
      await measure(
        'type-five-reply-characters',
        async () => {
          await input.pressSequentially('Alice');
          assert.equal(await input.inputValue(), 'Alice');
        },
        budget,
      );
      await measure(
        'insert-quote-into-draft',
        async () => {
          await page.evaluate(async () => {
            const { default: store } = await import('/src/stores/use-reply-modal-store.ts');
            store.getState().openReplyModal('/subs', 'quoted-reply', 42, 'benchmark-root', 1, 'music-posting.eth');
          });
          await page.waitForFunction(() => document.querySelector('[aria-labelledby="reply-modal-title"] textarea')?.value.includes('>>42'));
          assert.ok((await input.inputValue()).includes('Alice'));
        },
        budget,
      );
      await measure(
        'clear-reply-draft',
        async () => {
          await input.fill('');
          assert.equal(await input.inputValue(), '');
        },
        budget,
      );
    } finally {
      await page.evaluate(async () => {
        const { default: store } = await import('/src/stores/use-reply-modal-store.ts');
        store.getState().closeModal('/subs');
      });
      await input.waitFor({ state: 'hidden' });
    }
  },
};
