import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './json-editor.module.css';

type AceModuleLoadResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Editor: React.ComponentType<any>;
  onBeforeLoad: (ace: { config?: { setModuleUrl?: (name: string, value: string) => void } }) => void;
};

type AceState = { phase: 'loading' } | { phase: 'fallback' } | ({ phase: 'editor' } & AceModuleLoadResult);

const loadAce = async () => {
  const aceModule = await import('react-ace');
  // Do not start these before react-ace resolves; Ace chunks read the global ace
  // binding while evaluating and fail in production modules if they race ahead.
  const [workerJsonModule] = await Promise.all([
    import('ace-builds/src-noconflict/worker-json?url'),
    import('ace-builds/esm-resolver'),
    import('ace-builds/src-noconflict/mode-json'),
    import('ace-builds/src-noconflict/theme-monokai'),
  ]);
  const mod = aceModule.default;
  const Editor = typeof mod === 'function' ? mod : (mod as unknown as { default: typeof mod }).default;

  return {
    Editor,
    onBeforeLoad: (ace) => {
      ace.config?.setModuleUrl?.('ace/mode/json_worker', workerJsonModule.default);
    },
  } satisfies AceModuleLoadResult;
};

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  readOnly?: boolean;
}

const JsonEditor = ({ value, onChange, ariaLabel, readOnly = false }: JsonEditorProps) => {
  const { t } = useTranslation();
  const [ace, setAce] = useState<AceState>({ phase: 'loading' });

  useEffect(() => {
    let isCancelled = false;
    loadAce()
      .then((loaded) => {
        if (!isCancelled) setAce({ phase: 'editor', ...loaded });
      })
      .catch(() => {
        if (!isCancelled) setAce({ phase: 'fallback' });
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  if (ace.phase === 'loading') {
    return <div className={styles.loadingMessage}>{t('loading_editor')}</div>;
  }

  return (
    <>
      {ace.phase === 'fallback' && <div className={styles.fallbackWarning}>{t('editor_fallback_warning')}</div>}
      <div className={styles.editorContainer}>
        {ace.phase === 'editor' ? (
          <ace.Editor
            mode='json'
            theme='monokai'
            width='100%'
            height='500px'
            fontSize={13}
            showPrintMargin={false}
            value={value}
            readOnly={readOnly}
            onChange={onChange}
            onBeforeLoad={ace.onBeforeLoad}
          />
        ) : (
          <textarea
            aria-label={ariaLabel}
            className={styles.fallbackTextarea}
            value={value}
            readOnly={readOnly}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
          />
        )}
      </div>
    </>
  );
};

export default JsonEditor;
