import React from 'react';

interface TitlebarProps {
  title: string;
  showMinimize?: boolean;
  showMaximize?: boolean;
}

export const Titlebar: React.FC<TitlebarProps> = ({ title, showMinimize = true, showMaximize = true }) => {
  const handleMinimize = () => {
    const { remote } = window.require?.('electron') ?? {};
    // Use IPC to minimize
  };

  return (
    <div className="wlm-titlebar">
      <span className="wlm-titlebar-title">{title}</span>
      <div className="wlm-titlebar-buttons">
        {showMinimize && (
          <button className="wlm-titlebar-btn" title="Minimize" onClick={() => window.aerocord.windows.close()}>
            &#x2014;
          </button>
        )}
        {showMaximize && (
          <button className="wlm-titlebar-btn" title="Maximize">
            &#x25A1;
          </button>
        )}
        <button className="wlm-titlebar-btn close" title="Close" onClick={() => window.aerocord.windows.close()}>
          &#x2715;
        </button>
      </div>
    </div>
  );
};
