/** URLSearchParams#toString with commas left literal, so list values like ?c=g,sci,diy stay readable. Both forms decode the same. */
export const toReadableSearchString = (params: URLSearchParams): string => params.toString().replace(/%2C/gi, ',');
