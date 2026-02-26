import React from 'react';
import { assetUrl } from '../hooks/useAssets';

type AvatarSize = 'xs' | 'small' | 'medium' | 'large' | 'xl';

interface StatusAvatarProps {
  src: string;
  status: string;
  size?: AvatarSize;
  className?: string;
}

const SIZE_MAP: Record<AvatarSize, { px: number; prefix: string; innerRatio: number }> = {
  xs:     { px: 20, prefix: 'XS',     innerRatio: 0.58 },
  small:  { px: 32, prefix: 'Small',  innerRatio: 0.60 },
  medium: { px: 50, prefix: 'Medium', innerRatio: 0.62 },
  large:  { px: 76, prefix: 'Large',  innerRatio: 0.66 },
  xl:     { px: 96, prefix: 'XL',     innerRatio: 0.72 },
};

function frameFile(prefix: string, status: string): string {
  switch (status) {
    case 'Online': return `${prefix}FrameActive.png`;
    case 'Idle': return `${prefix}FrameIdle.png`;
    case 'DoNotDisturb': return `${prefix}FrameDnd.png`;
    case 'Invisible':
    case 'Offline':
    default: return `${prefix}FrameOffline.png`;
  }
}

export const StatusAvatar: React.FC<StatusAvatarProps> = ({
  src,
  status,
  size = 'medium',
  className = '',
}) => {
  const { px, prefix, innerRatio } = SIZE_MAP[size];
  const frameSrc = assetUrl('images', 'frames', 'Frames', frameFile(prefix, status));
  const placeholderSrc = assetUrl('images', 'frames', 'Frames', 'PlaceholderPfp.png');

  const innerSize = Math.round(px * innerRatio);
  const innerRadius = Math.max(2, Math.round(px * 0.07));

  return (
    <div
      className={`status-avatar ${className}`}
      style={{ width: px, height: px, position: 'relative', flexShrink: 0, overflow: 'hidden' }}
    >
      <img
        src={src || placeholderSrc}
        alt=""
        draggable={false}
        style={{
          width: innerSize,
          height: innerSize,
          objectFit: 'cover',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          borderRadius: innerRadius,
        }}
      />
      <img
        src={frameSrc}
        alt=""
        draggable={false}
        style={{
          width: px,
          height: px,
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
