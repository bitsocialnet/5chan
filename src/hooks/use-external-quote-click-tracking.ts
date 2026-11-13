import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { markExternalQuoteClicksLeftPage } from '../lib/utils/external-quote-click-utils';

// Mounted once for the whole app. The cleanup runs after each navigation and when the layout unmounts,
// when the URL already shows where the user went, so pending quote clicks learn that their page was left.
const useExternalQuoteClickTracking = () => {
  const { key } = useLocation();

  useEffect(() => () => markExternalQuoteClicksLeftPage(), [key]);
};

export default useExternalQuoteClickTracking;
