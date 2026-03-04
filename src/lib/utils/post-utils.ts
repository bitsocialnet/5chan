export function hashStringToColor(str: string): string {
  if (!str) {
    return '';
  }

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const r = (hash >> 24) & 0xff;
  const g = (hash >> 16) & 0xff;
  const b = (hash >> 8) & 0xff;

  return `rgb(${r}, ${g}, ${b})`;
}

export function getTextColorForBackground(rgb: string): string {
  const [r, g, b] = rgb.match(/\d+/g)?.map(Number) || [0, 0, 0];
  const brightness = r * 0.299 + g * 0.587 + b * 0.114;
  return brightness > 125 ? 'black' : 'white';
}

export function removeMarkdown(md: string): string {
  return md
    .replace(/<spoiler>(.*?)<\/spoiler>/gs, '$1') // spoiler tags - keep inner text
    .replace(/\[([^\]]*?)\]\([^)]*\)/g, '$1') // [text](url) -> text
    .replace(/&nbsp;/g, ' ') // &nbsp; -> space
    .replace(/^>\s*/gm, '') // greentext at line start
    .replace(/[*_]/g, '') // bold/italic markers
    .replace(/```[\s\S]*?```/g, (m) => m.slice(3, -3)) // code blocks - keep content
    .replace(/`([^`]*)`/g, '$1') // inline code - keep content
    .trim();
}
