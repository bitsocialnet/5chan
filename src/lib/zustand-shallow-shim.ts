// zustand v4's `zustand/shallow` default export wraps the real comparator in a
// console.warn deprecation notice that fires on EVERY call. bitsocial-react-hooks
// imports it as a default (comments.js, communities.js, feeds.js) and passes it as
// the zustand equality function, so the warning fires once per subscriber per store
// notification — ~1000 times/second while a feed streams.
//
// Aliasing `zustand/shallow` to this shim keeps zustand v4's comparison semantics while
// dropping the per-call console.warn. Remove once bitsocial-react-hooks switches to
// the named `import { shallow } from 'zustand/shallow'`.
//
// The comparator is zustand v4's, copied rather than imported: the app's own zustand is v5,
// whose `shallow` copies both arrays into Maps on every call and is several times slower on
// the arrays these hot subscriptions compare.
export function shallow<T>(objA: T, objB: T): boolean {
  if (Object.is(objA, objB)) {
    return true;
  }
  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false;
  }
  if (objA instanceof Map && objB instanceof Map) {
    if (objA.size !== objB.size) return false;
    for (const [key, value] of objA) {
      if (!Object.is(value, objB.get(key))) {
        return false;
      }
    }
    return true;
  }
  if (objA instanceof Set && objB instanceof Set) {
    if (objA.size !== objB.size) return false;
    for (const value of objA) {
      if (!objB.has(value)) {
        return false;
      }
    }
    return true;
  }
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) {
    return false;
  }
  for (const keyA of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, keyA) || !Object.is(objA[keyA as keyof T], objB[keyA as keyof T])) {
      return false;
    }
  }
  return true;
}

export default shallow;
