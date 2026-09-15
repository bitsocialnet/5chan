export async function waitForAccountReady(page) {
  const accountsStore = await page.evaluateHandle(async () => (await import('/src/lib/bitsocial-internals/stores.ts')).accountsStore);
  try {
    // Keep the predicate synchronous: Playwright treats a Promise as truthy.
    await page.waitForFunction((store) => {
      const state = store.getState();
      return (
        !window.BITSOCIAL_REACT_HOOKS_ACCOUNTS_STORE_INITIALIZING &&
        state.accountIds.includes(state.activeAccountId) &&
        Boolean(state.accounts[state.activeAccountId] && state.accountsCommentsReplies[state.activeAccountId])
      );
    }, accountsStore);
  } finally {
    await accountsStore.dispose();
  }
}
