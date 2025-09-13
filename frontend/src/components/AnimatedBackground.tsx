import React from 'react';

interface AnimatedBackgroundProps {
  isUploading?: boolean;
}

const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({ isUploading = false }) => {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Large geometric shapes */}
      <div className={`absolute inset-0 ${isUploading ? 'upload-active' : ''}`}>
        {/* Large circle - top left */}
        <div className="absolute -top-1/2 -left-1/2 w-full h-full animate-rotate-slow">
          <div className="large-circle opacity-40"></div>
        </div>

        {/* Large square - center right */}
        <div className="absolute top-1/4 -right-1/3 w-3/4 h-3/4 animate-rotate-reverse">
          <div className="large-square opacity-30"></div>
        </div>

        {/* Large hexagon - bottom left */}
        <div className="absolute -bottom-1/3 left-1/4 w-2/3 h-2/3 animate-rotate-slow-offset">
          <div className="large-hexagon opacity-35"></div>
        </div>
      </div>
    </div>
  );
};

export default AnimatedBackground;