import { beforeEach, describe, expect, it } from 'vitest';
import useAuthorAddressClick from '../use-author-address-click';

describe('useAuthorAddressClick', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('highlights matching author nodes except the op post and clears previous highlights', () => {
    document.body.innerHTML = `
      <span class="highlight" data-author-address="old" data-post-cid="post-1" data-cid="reply-old"></span>
      <span data-author-address="0x1...3" data-post-cid="post-1" data-cid="post-1"></span>
      <span data-author-address="0x1...3" data-post-cid="post-1" data-cid="reply-1"></span>
      <span data-author-address="0x1...3" data-post-cid="post-1" data-cid="reply-2"></span>
    `;

    const handleUserAddressClick = useAuthorAddressClick();
    handleUserAddressClick('0x1...3', 'post-1');

    const matches = document.querySelectorAll('[data-author-address="0x1...3"][data-post-cid="post-1"]');
    expect(matches[0].classList.contains('highlight')).toBe(false);
    expect(matches[1].classList.contains('highlight')).toBe(true);
    expect(matches[2].classList.contains('highlight')).toBe(true);
    expect(document.querySelector('[data-author-address="old"]')?.classList.contains('highlight')).toBe(false);
  });

  it('toggles the highlight off when the same address is clicked again', () => {
    document.body.innerHTML = `
      <span data-author-address="0x1...3" data-post-cid="post-1" data-cid="reply-1"></span>
      <span data-author-address="0x1...3" data-post-cid="post-1" data-cid="reply-2"></span>
    `;

    const handleUserAddressClick = useAuthorAddressClick();
    handleUserAddressClick('0x1...3', 'post-1');
    handleUserAddressClick('0x1...3', 'post-1');

    const matches = document.querySelectorAll('[data-author-address="0x1...3"][data-post-cid="post-1"]');
    expect(matches[0].classList.contains('highlight')).toBe(false);
    expect(matches[1].classList.contains('highlight')).toBe(false);
  });
});
