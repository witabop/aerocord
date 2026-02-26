import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/global.css';
import '../shared/styles/wlm-components.css';
import { SettingsApp } from './SettingsApp';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<SettingsApp />);
}
