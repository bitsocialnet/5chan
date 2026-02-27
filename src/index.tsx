import './polyfills.js';
import './lib/react-scan';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';
import { HashRouter as Router } from 'react-router-dom';
import './lib/init-translations';
import './index.css';
import './themes.css';
import { App as CapacitorApp } from '@capacitor/app';
import { Analytics } from '@vercel/analytics/react';

// Only enable analytics on 5chan.app (Vercel deployment)
// Exclude Electron (file:// or localhost), Capacitor/APK (capacitor:// or localhost), and IPFS (ipfs:// or different domain)
const isVercelDeployment =
  typeof window !== 'undefined' && (window.location.hostname === '5chan.app' || window.location.hostname === 'www.5chan.app') && !window.isElectron;

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <Router>
      <App />
      {isVercelDeployment && <Analytics />}
    </Router>
  </React.StrictMode>,
);

// add back button in android app
CapacitorApp.addListener('backButton', ({ canGoBack }) => {
  if (canGoBack) {
    window.history.back();
  } else {
    CapacitorApp.exitApp();
  }
});
