import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const getContainerZIndex = (cssPath: string) => {
  const css = readFileSync(join(process.cwd(), cssPath), 'utf8');
  const containerRule = css.match(/^\.container\s*\{([^}]*)\}/m)?.[1] ?? '';
  return Number(containerRule.match(/z-index:\s*(\d+)/)?.[1]);
};

describe('challenge modal stacking', () => {
  // A reply with a file stays in the open reply modal while the board's spam blocker checks it, so the
  // check's challenge must cover the reply modal instead of opening underneath it.
  it('stacks above the reply modal', () => {
    const challengeZIndex = getContainerZIndex('src/components/challenge-modal/challenge-modal.module.css');
    const replyModalZIndex = getContainerZIndex('src/components/reply-modal/reply-modal.module.css');

    expect(replyModalZIndex).toBeGreaterThan(0);
    expect(challengeZIndex).toBeGreaterThan(replyModalZIndex);
  });
});
