import type { BlotterEntry } from '../../lib/utils/blotter-utils';
import styles from './blotter-message.module.css';

const RELEASES_BASE = 'https://github.com/bitsocialnet/5chan/releases/tag/v';

function normalizeMessage(text: string): string {
  return text.replace(/subplebbit/gi, 'board').replace(/plebchan/gi, '5chan');
}

const BlotterMessage = ({ entry }: { entry: BlotterEntry }) => {
  if (entry.kind === 'release' && entry.version) {
    const idx = entry.message.indexOf(': ');
    const oneLiner = idx >= 0 ? entry.message.slice(idx + 2) : entry.message;
    return (
      <>
        <a href={`${RELEASES_BASE}${entry.version}`} className={styles.versionLink} target='_blank' rel='noopener noreferrer'>
          v{entry.version}
        </a>
        : {normalizeMessage(oneLiner)}
      </>
    );
  }
  return <>{normalizeMessage(entry.message)}</>;
};

export default BlotterMessage;
