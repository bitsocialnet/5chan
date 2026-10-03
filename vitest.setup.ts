import { setPkcJs } from '@bitsocial/bitsocial-react-hooks/dist/lib/pkc-js/index.js';
import PkcJsMock from '@bitsocial/bitsocial-react-hooks/dist/lib/pkc-js/pkc-js-mock.js';

// Importing any bitsocial-react-hooks store creates a default account at module load. jsdom has no
// window.defaultPkcOptions, so the real client would boot libp2p; its it-queue timers can fire after
// jsdom teardown and fail the run with an unhandled dispatchEvent TypeError.
setPkcJs(PkcJsMock);

const storageState = new Map<string, string>();

const storageProto = Storage.prototype;

Object.defineProperties(storageProto, {
  clear: {
    configurable: true,
    enumerable: false,
    value: function clear() {
      storageState.clear();
    },
    writable: true,
  },
  getItem: {
    configurable: true,
    enumerable: false,
    value: function getItem(key: string) {
      const normalizedKey = String(key);
      return storageState.has(normalizedKey) ? storageState.get(normalizedKey) ?? null : null;
    },
    writable: true,
  },
  key: {
    configurable: true,
    enumerable: false,
    value: function key(index: number) {
      return Array.from(storageState.keys())[index] ?? null;
    },
    writable: true,
  },
  length: {
    configurable: true,
    enumerable: true,
    get() {
      return storageState.size;
    },
  },
  removeItem: {
    configurable: true,
    enumerable: false,
    value: function removeItem(key: string) {
      storageState.delete(String(key));
    },
    writable: true,
  },
  setItem: {
    configurable: true,
    enumerable: false,
    value: function setItem(key: string, value: string) {
      storageState.set(String(key), String(value));
    },
    writable: true,
  },
});

const localStorageMock = Object.create(storageProto) as Storage;

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  enumerable: true,
  value: localStorageMock,
  writable: true,
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: localStorageMock,
    writable: true,
  });
}
