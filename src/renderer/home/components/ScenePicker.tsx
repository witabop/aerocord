import React, { useState, useEffect, useCallback } from 'react';
import type { SceneVM } from '../../shared/types';

interface ScenePickerProps {
  visible: boolean;
  onClose: () => void;
  onSceneChange: (scene: SceneVM) => void;
}

export const ScenePicker: React.FC<ScenePickerProps> = ({ visible, onClose, onSceneChange }) => {
  const [scenes, setScenes] = useState<SceneVM[]>([]);
  const [currentId, setCurrentId] = useState<number>(0);

  useEffect(() => {
    if (!visible) return;
    Promise.all([
      window.aerocord.theme.getScenes(),
      window.aerocord.theme.getCurrent(),
    ]).then(([allScenes, current]) => {
      setScenes(allScenes);
      if (current) setCurrentId(current.id);
    });
  }, [visible]);

  const handleSelect = useCallback(async (scene: SceneVM) => {
    setCurrentId(scene.id);
    await window.aerocord.theme.setCurrent(scene.id);
    onSceneChange(scene);
  }, [onSceneChange]);

  if (!visible) return null;

  return (
    <div className="scene-picker-overlay" onClick={onClose}>
      <div className="scene-picker" onClick={(e) => e.stopPropagation()}>
        <div className="scene-picker-title">Choose a scene</div>
        <div className="scene-picker-list">
          {scenes.map(scene => (
            <div
              key={scene.id}
              className={`scene-picker-item ${scene.id === currentId ? 'active' : ''}`}
              onClick={() => handleSelect(scene)}
            >
              <div
                className="scene-picker-swatch"
                style={{ backgroundColor: scene.color }}
              />
              <span className="scene-picker-name">{scene.displayName}</span>
            </div>
          ))}
        </div>
        <div className="scene-picker-close">
          <button className="wlm-button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
