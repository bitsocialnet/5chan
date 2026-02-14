import { useTranslation } from 'react-i18next';
import packageJson from '../../../package.json';

const { version } = packageJson;
const commitRef = import.meta.env.VITE_COMMIT_REF;
const isElectron = window.electronApi?.isElectron === true;

const Version = () => {
  const { t } = useTranslation();
  return (
    <>
      <a
        href={commitRef ? `https://github.com/bitsocialhq/5chan/commit/${commitRef}` : `https://github.com/bitsocialhq/5chan/releases/tag/v${version}`}
        target='_blank'
        rel='noopener noreferrer'
      >
        v{commitRef ? `${version}#${commitRef.slice(0, 7)}` : version}
      </a>
      {isElectron && (
        <>
          {' '}
          -{' '}
          <a href='http://localhost:50019/webui/' target='_blank' rel='noreferrer'>
            {t('node_stats')}
          </a>
        </>
      )}
    </>
  );
};

export default Version;
