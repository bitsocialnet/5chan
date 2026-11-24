/** URLSearchParams#toString with commas and @ left literal, so values like ?c=g,sci,diy and ?c=@tech stay readable. Both forms decode the same. */
export const toReadableSearchString = (params: URLSearchParams): string => params.toString().replace(/%2C/gi, ',').replace(/%40/g, '@');
