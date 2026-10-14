import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postFormData } from '../upload-request-utils';

class FakeXhr {
  static instances: FakeXhr[] = [];
  upload: { onload: (() => void) | null } = { onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  statusText = '';
  responseText = '';
  method = '';
  url = '';
  sentBody: unknown;
  abortCalls = 0;

  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(body: unknown) {
    this.sentBody = body;
  }
  abort() {
    this.abortCalls++;
    this.onabort?.();
  }
  respond(status: number, statusText: string, responseText: string) {
    this.status = status;
    this.statusText = statusText;
    this.responseText = responseText;
    this.onload?.();
  }
}

const lastXhr = () => FakeXhr.instances[FakeXhr.instances.length - 1];

describe('postFormData', () => {
  beforeEach(() => {
    FakeXhr.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the form data and resolves with the status and a JSON reader', async () => {
    const body = new FormData();
    body.append('file', new File(['x'], 'x.png'));

    const pending = postFormData('https://api.example/upload', body);
    const xhr = lastXhr();
    expect(xhr).toMatchObject({ method: 'POST', url: 'https://api.example/upload', sentBody: body });
    xhr.respond(200, 'OK', '{"status":"live"}');
    const response = await pending;

    expect(response).toMatchObject({ ok: true, status: 200, statusText: 'OK' });
    await expect(response.json()).resolves.toEqual({ status: 'live' });
  });

  it('resolves a non-2xx answer as not ok, and its json() rejects on a non-JSON body', async () => {
    const pending = postFormData('https://api.example/upload', new FormData());
    lastXhr().respond(502, 'Bad Gateway', '<html>');
    const response = await pending;

    expect(response).toMatchObject({ ok: false, status: 502, statusText: 'Bad Gateway' });
    await expect(response.json()).rejects.toThrow(SyntaxError);
  });

  it('reports when the body has been sent, before the answer arrives', async () => {
    const onBodySent = vi.fn();
    const pending = postFormData('https://api.example/upload', new FormData(), { onBodySent });
    const xhr = lastXhr();

    expect(onBodySent).not.toHaveBeenCalled();
    xhr.upload.onload?.();
    expect(onBodySent).toHaveBeenCalledOnce();
    xhr.respond(200, 'OK', '{}');
    await pending;
  });

  it('registers no upload listener without onBodySent, so the request needs no preflight', () => {
    void postFormData('https://api.example/upload', new FormData());

    expect(lastXhr().upload.onload).toBeNull();
  });

  it('rejects with a TypeError on a network failure', async () => {
    const pending = postFormData('https://api.example/upload', new FormData());
    lastXhr().onerror?.();

    await expect(pending).rejects.toThrow(TypeError);
  });

  it('aborts the request when the signal aborts, rejecting with an AbortError', async () => {
    const controller = new AbortController();
    const pending = postFormData('https://api.example/upload', new FormData(), { signal: controller.signal });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(lastXhr().abortCalls).toBe(1);
  });

  it('rejects at once without sending when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(postFormData('https://api.example/upload', new FormData(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeXhr.instances).toEqual([]);
  });
});
