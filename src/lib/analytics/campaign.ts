import { landingUrl } from './shared';

const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const SESSION_CAMPAIGN_KEY = '5chan-analytics-campaign';
const VISITS_KEY = '5chan-analytics-visits';
const DAY_MS = 86_400_000;
// A return visit is reported once per range, so each count is how many browsers came back at least once in it.
const RETURN_RANGES: [lastDay: number, range: string][] = [
  [1, '1'],
  [7, '2-7'],
  [14, '8-14'],
  [30, '15-30'],
  [60, '31-60'],
  [Infinity, '61+'],
];

type VisitRecord = { first: number; campaign: string; sent: string[] };
type VisitEvent = { name: 'first_visit'; data: { campaign: string } } | { name: 'return_visit'; data: { campaign: string; days: string } };

// Tags come from whatever link opened the page, so only short lowercase slugs are kept.
const toSlug = (value: string | null): string =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const readCampaign = (sources: URLSearchParams[]): URLSearchParams => {
  const campaign = new URLSearchParams();
  for (const key of CAMPAIGN_KEYS) {
    const value = sources.map((source) => toSlug(source.get(key))).find(Boolean);
    if (value) campaign.set(key, value);
  }
  return campaign;
};

// index.html rewrites a path link (5chan.app/pol/?utm_source=x) to #/pol/?utm_source=x, so tags can
// sit before the hash or in the hash route's query.
const parseCampaign = (href: string): URLSearchParams => {
  try {
    const url = new URL(href);
    const hashQuery = url.hash.indexOf('?');
    return readCampaign([url.searchParams, new URLSearchParams(hashQuery === -1 ? '' : url.hash.slice(hashQuery + 1))]);
  } catch {
    return new URLSearchParams();
  }
};

let sessionCampaign: URLSearchParams | undefined;
// The landing route's query is gone after the first in-app navigation, so the tab keeps its tags.
export const getSessionCampaign = (): URLSearchParams => {
  if (sessionCampaign) return sessionCampaign;
  sessionCampaign = parseCampaign(landingUrl);
  try {
    if (sessionCampaign.toString()) sessionStorage.setItem(SESSION_CAMPAIGN_KEY, sessionCampaign.toString());
    else sessionCampaign = readCampaign([new URLSearchParams(sessionStorage.getItem(SESSION_CAMPAIGN_KEY) ?? '')]);
  } catch {
    // Storage may be blocked; the landing URL's tags still apply to this page load.
  }
  return sessionCampaign;
};

const getCampaignLabel = (campaign: URLSearchParams): string => [campaign.get('utm_source'), campaign.get('utm_campaign')].filter(Boolean).join('/') || 'none';

const readVisits = (raw: string | null): VisitRecord | undefined => {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (Number.isInteger(value?.first) && typeof value.campaign === 'string' && Array.isArray(value.sent)) return value;
  } catch {
    // A damaged record starts a new one.
  }
  return undefined;
};

let checkedDay: number | undefined;
// Only the first-visit day, its campaign and the ranges already reported stay in this browser; no ID is
// stored or sent. Returns the event this page view should send, if any.
export const recordVisit = (now = Date.now()): VisitEvent | undefined => {
  const today = Math.floor((now - new Date(now).getTimezoneOffset() * 60_000) / DAY_MS);
  if (checkedDay === today) return undefined;
  checkedDay = today;
  try {
    const record = readVisits(localStorage.getItem(VISITS_KEY));
    if (!record) {
      const campaign = getCampaignLabel(getSessionCampaign());
      localStorage.setItem(VISITS_KEY, JSON.stringify({ first: today, campaign, sent: [] } satisfies VisitRecord));
      return { name: 'first_visit', data: { campaign } };
    }
    const days = today - record.first;
    const range = RETURN_RANGES.find(([lastDay]) => days <= lastDay)?.[1];
    if (days < 1 || !range || record.sent.includes(range)) return undefined;
    localStorage.setItem(VISITS_KEY, JSON.stringify({ ...record, sent: [...record.sent, range] }));
    return { name: 'return_visit', data: { campaign: record.campaign, days: range } };
  } catch {
    // Without storage a visit cannot be told apart from a first one, so nothing is sent.
    return undefined;
  }
};
