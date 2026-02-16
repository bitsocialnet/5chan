// Best-effort sync of 5chan-directories.json from GitHub
// Updates the vendored fallback in src/data/ so production builds ship a fresh snapshot.
// Never fails the build — if the fetch fails (offline, rate-limited, etc.), the existing file is kept.

import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GITHUB_URL = 'https://raw.githubusercontent.com/bitsocialhq/lists/master/5chan-directories.json';
const OUTPUT_PATH = join(__dirname, '..', 'src', 'data', '5chan-directories.json');
const TIMEOUT_MS = 5000;
const DEFAULT_METADATA = {
  title: '5chan directories',
  description: '',
  createdAt: 0,
  updatedAt: 0,
};

const isRecord = (value) => typeof value === 'object' && value !== null;

const normalizeFeatures = (value) => {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalizedFeatures = Object.entries(value).reduce((acc, [key, featureValue]) => {
    if (typeof featureValue === 'string' || typeof featureValue === 'boolean' || typeof featureValue === 'number') {
      acc[key] = featureValue;
    }
    return acc;
  }, {});

  return Object.keys(normalizedFeatures).length > 0 ? normalizedFeatures : undefined;
};

const toCanonicalCommunity = ({ address, title, nsfw, directoryCode, features }) => {
  if (typeof address !== 'string') {
    return null;
  }

  const normalizedFeatures = normalizeFeatures(features);
  const topLevelNsfw = typeof nsfw === 'boolean' ? nsfw : undefined;
  const featuresNsfw = typeof normalizedFeatures?.nsfw === 'boolean' ? normalizedFeatures.nsfw : undefined;

  return {
    address,
    ...(typeof title === 'string' ? { title } : {}),
    ...(typeof directoryCode === 'string' ? { directoryCode } : {}),
    ...(normalizedFeatures ? { features: normalizedFeatures } : {}),
    ...((topLevelNsfw ?? featuresNsfw) !== undefined ? { nsfw: topLevelNsfw ?? featuresNsfw } : {}),
  };
};

const dedupeCommunities = (entries) => {
  const seenAddresses = new Set();
  const normalized = [];

  for (const entry of entries) {
    if (seenAddresses.has(entry.address)) {
      continue;
    }
    seenAddresses.add(entry.address);
    normalized.push(entry);
  }

  return normalized;
};

const adaptV2Directories = (value) => {
  if (!Array.isArray(value.directories)) {
    return [];
  }

  const communities = value.directories
    .map((directory) => {
      if (!isRecord(directory)) {
        return null;
      }
      const features = isRecord(directory.features) ? directory.features : null;
      return toCanonicalCommunity({
        address: directory.communityAddress,
        title: directory.title,
        nsfw: features?.nsfw,
        directoryCode: directory.directoryCode,
        features,
      });
    })
    .filter(Boolean);

  return dedupeCommunities(communities);
};

const adaptV1Communities = (value) => {
  if (!Array.isArray(value.communities)) {
    return [];
  }

  const communities = value.communities
    .map((community) => {
      if (!isRecord(community)) {
        return null;
      }
      return toCanonicalCommunity({
        address: community.address,
        title: community.title,
        nsfw: community.nsfw,
        directoryCode: community.directoryCode,
        features: community.features,
      });
    })
    .filter(Boolean);

  return dedupeCommunities(communities);
};

const normalizeDirectoriesData = (value, fallbackMetadata = DEFAULT_METADATA) => {
  if (!isRecord(value)) {
    return null;
  }

  const adapters = [adaptV2Directories, adaptV1Communities];
  const communities = adapters.map((adapter) => adapter(value)).find((normalized) => normalized.length > 0) || [];
  if (communities.length === 0) {
    return null;
  }

  return {
    title: typeof value.title === 'string' ? value.title : fallbackMetadata.title,
    description: typeof value.description === 'string' ? value.description : fallbackMetadata.description,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : fallbackMetadata.createdAt,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : fallbackMetadata.updatedAt,
    communities,
  };
};

const getErrorMessage = (error) => (error instanceof Error ? error.message : String(error));

const sync = async () => {
  try {
    let existing = '';
    let fallbackMetadata = DEFAULT_METADATA;
    try {
      existing = readFileSync(OUTPUT_PATH, 'utf8');
      const parsedExisting = JSON.parse(existing);
      const normalizedExisting = normalizeDirectoriesData(parsedExisting);
      if (normalizedExisting) {
        fallbackMetadata = {
          title: normalizedExisting.title,
          description: normalizedExisting.description,
          createdAt: normalizedExisting.createdAt,
          updatedAt: normalizedExisting.updatedAt,
        };
      }
    } catch {
      // file doesn't exist yet or is invalid JSON
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response;
    try {
      response = await fetch(GITHUB_URL, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!response || !response.ok) {
      throw new Error(`HTTP ${response?.status ?? 'unknown'}`);
    }

    const data = normalizeDirectoriesData(await response.json(), fallbackMetadata);
    if (!data) {
      throw new Error('Invalid directories payload');
    }

    const formatted = JSON.stringify(data, null, 2) + '\n';

    if (formatted === existing) {
      console.log('✅ Vendored directories already up to date');
      return;
    }

    writeFileSync(OUTPUT_PATH, formatted, 'utf8');
    console.log(`✅ Synced vendored directories (${data.communities.length} communities)`);
  } catch (e) {
    console.warn(`⚠️  Could not sync directories from GitHub (keeping existing file): ${getErrorMessage(e)}`);
  }
};

sync();
