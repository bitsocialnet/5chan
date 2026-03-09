import Version from '../version';

type SiteLegalMetaOrder = 'version-first' | 'license-first';

type SiteLegalMetaProps = {
  /** Order of blocks: version-first (homepage) or license-first (board/post footer) */
  order?: SiteLegalMetaOrder;
};

const LicenseText = () => <span>5chan is free and open-source software under GPLv2 license.</span>;

const VersionFeedbackContact = () => (
  <>
    <Version /> •{' '}
    <a href='https://github.com/bitsocialnet/5chan/issues/new' target='_blank' rel='noopener noreferrer'>
      Feedback
    </a>{' '}
    •{' '}
    <a href='https://github.com/bitsocialnet/5chan/graphs/contributors' target='_blank' rel='noopener noreferrer'>
      Contact
    </a>
  </>
);

const SiteLegalMeta = ({ order = 'version-first' }: SiteLegalMetaProps) => {
  const first = order === 'version-first' ? <VersionFeedbackContact /> : <LicenseText />;
  const second = order === 'version-first' ? <LicenseText /> : <VersionFeedbackContact />;

  if (order === 'version-first') {
    return (
      <>
        <br />
        {first}
        <br />
        <br />
        <br />
        {second}
      </>
    );
  }

  return (
    <>
      {first}
      <br />
      <span style={{ display: 'block', marginTop: 5 }}>{second}</span>
    </>
  );
};

export default SiteLegalMeta;
