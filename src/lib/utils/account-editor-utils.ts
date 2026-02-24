import stringify from 'json-stringify-pretty-compact';

type AccountLike = {
  id?: string;
  name?: string;
  author?: { address?: string; shortAddress?: string; avatar?: unknown };
  plebbit?: unknown;
  karma?: unknown;
  plebbitReactOptions?: unknown;
  unreadNotificationCount?: unknown;
  [key: string]: unknown;
};

/**
 * Build the editable JSON string for an account, stripping runtime-only fields.
 */
export const buildEditableAccountJson = (account: AccountLike | undefined): string =>
  stringify({
    account: {
      ...account,
      author: { ...account?.author, avatar: undefined },
      plebbit: undefined,
      karma: undefined,
      plebbitReactOptions: undefined,
      unreadNotificationCount: undefined,
    },
  });

export const safeParseAccountJson = (text: string): { account: Record<string, unknown> } | null => {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.account && typeof parsed.account === 'object') {
      return parsed as { account: Record<string, unknown> };
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Build a save-ready account payload, preserving the original account id.
 */
export const buildSavePayload = (parsed: { account: Record<string, unknown> }, originalId: string | undefined): Record<string, unknown> => ({
  ...parsed.account,
  id: originalId,
});
