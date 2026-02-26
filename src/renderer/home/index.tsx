import React from 'react';
import { createRoot } from 'react-dom/client';
import '../shared/styles/global.css';
import '../shared/styles/wlm-components.css';
import { HomeApp } from './HomeApp';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<HomeApp />);
}
