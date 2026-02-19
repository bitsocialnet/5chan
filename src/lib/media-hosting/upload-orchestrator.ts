import type { ProviderId } from './types';
import { uploadToCatbox } from '../utils/catbox-utils';

export interface OrchestratorAttempt {
  provider: ProviderId;
  success: boolean;
  url?: string;
  error?: string;
}

function resolveElectronFilePath(file: File): string | null {
  const fileWithPath = file as File & { path?: string };
  if (typeof fileWithPath.path === 'string' && fileWithPath.path.length > 0) {
    return fileWithPath.path;
  }

  const getPathForFile = window.electronApi?.getPathForFile;
  if (typeof getPathForFile === 'function') {
    const resolvedPath = getPathForFile(file);
    if (typeof resolvedPath === 'string' && resolvedPath.length > 0) {
      return resolvedPath;
    }
  }

  return null;
}

/**
 * Uploads a file via a single provider. Catbox uses the web API;
 * imgur/postimages use Electron automation when available.
 */
async function uploadViaProvider(provider: ProviderId, file: File): Promise<string> {
  if (provider === 'catbox') return uploadToCatbox(file);
  if (provider === 'imgur' || provider === 'postimages') {
    const fn = typeof window !== 'undefined' && window.electronApi?.automateUploadMedia;
    if (fn) {
      const filePath = resolveElectronFilePath(file);
      if (!filePath) throw new Error('File path required for Electron automation');
      const { url } = await fn({ provider, filePath });
      return url;
    }
    throw new Error(`Provider ${provider} requires Electron (automateUploadMedia not available)`);
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Orchestrates Electron upload: tries each provider in order, returns URL on first success.
 * Collects attempt errors. Throws with attempts if all fail.
 */
export async function orchestrateElectronUpload(file: File, providerOrder: ProviderId[]): Promise<string> {
  const attempts: OrchestratorAttempt[] = [];

  for (const provider of providerOrder) {
    try {
      const url = await uploadViaProvider(provider, file);
      return url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      attempts.push({ provider, success: false, error: msg });
    }
  }

  const err = new Error('All providers failed') as Error & { attempts: OrchestratorAttempt[] };
  err.attempts = attempts;
  throw err;
}
