import { readImageDigests } from './image-digests-reader';

// Reading and hashing run in this worker so a large image never blocks scrolling.
const scope = self as unknown as Pick<Worker, 'postMessage' | 'onmessage'>;

scope.onmessage = async (event: MessageEvent<{ id: number; url: string; md5: boolean }>) => {
  const { id, url, md5 } = event.data;
  scope.postMessage({ id, result: await readImageDigests(url, { md5 }) });
};
