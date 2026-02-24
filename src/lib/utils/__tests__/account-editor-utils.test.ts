import { describe, it, expect } from 'vitest';
import { buildEditableAccountJson, safeParseAccountJson, buildSavePayload } from '../account-editor-utils';

describe('buildEditableAccountJson', () => {
  it('strips runtime-only fields from account', () => {
    const account = {
      id: 'abc',
      name: 'Account 1',
      author: { address: '0x123', shortAddress: '0x1...3', avatar: { url: 'https://example.com' } },
      plebbit: { someOption: true },
      karma: 42,
      plebbitReactOptions: { foo: 'bar' },
      unreadNotificationCount: 5,
    };
    const result = JSON.parse(buildEditableAccountJson(account));
    expect(result.account.id).toBe('abc');
    expect(result.account.name).toBe('Account 1');
    expect(result.account.author.address).toBe('0x123');
    expect(result.account.author.avatar).toBeUndefined();
    expect(result.account.plebbit).toBeUndefined();
    expect(result.account.karma).toBeUndefined();
    expect(result.account.plebbitReactOptions).toBeUndefined();
    expect(result.account.unreadNotificationCount).toBeUndefined();
  });

  it('handles undefined account', () => {
    const result = buildEditableAccountJson(undefined);
    expect(result).toBeTruthy();
    const parsed = JSON.parse(result);
    expect(parsed.account).toBeDefined();
  });
});

describe('safeParseAccountJson', () => {
  it('parses valid account JSON', () => {
    const result = safeParseAccountJson('{"account": {"name": "test"}}');
    expect(result).toEqual({ account: { name: 'test' } });
  });

  it('returns null for invalid JSON', () => {
    expect(safeParseAccountJson('not json')).toBeNull();
  });

  it('returns null for JSON without account key', () => {
    expect(safeParseAccountJson('{"name": "test"}')).toBeNull();
  });

  it('returns null for non-object account', () => {
    expect(safeParseAccountJson('{"account": "string"}')).toBeNull();
  });
});

describe('buildSavePayload', () => {
  it('preserves original account id', () => {
    const parsed = { account: { name: 'updated', id: 'wrong-id' } };
    const result = buildSavePayload(parsed, 'original-id');
    expect(result.id).toBe('original-id');
    expect(result.name).toBe('updated');
  });

  it('handles undefined original id', () => {
    const parsed = { account: { name: 'test' } };
    const result = buildSavePayload(parsed, undefined);
    expect(result.id).toBeUndefined();
    expect(result.name).toBe('test');
  });
});
