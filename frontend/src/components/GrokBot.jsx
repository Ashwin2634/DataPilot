import React, { useEffect, useRef, useState, useCallback } from 'react';

const STATE_CONFIG = {
  idle: {
    eyeScaleY: 1,
    eyeRotate: 0,
    eyeOffsetY: 0,
    headScale: 1,
    bounce: 'none',
    intensity: 0.3,
  },
  thinking: {
    eyeScaleY: 0.85,
    eyeRotate: -6,
    eyeOffsetY: -2,
    headScale: 1,
    bounce: 'grok-thinking 2.4s ease-in-out infinite',
    intensity: 0.6,
  },
  loading: {
    eyeScaleY: 1,
    eyeRotate: 0,
    eyeOffsetY: 0,
    headScale: 1,
    bounce: 'grok-loading-shake 1.6s ease-in-out infinite',
    intensity: 1,
  },
  excited: {
    eyeScaleY: 1.15,
    eyeRotate: 0,
    eyeOffsetY: -4,
    headScale: 1.05,
    bounce: 'grok-excited 0.7s ease-in-out infinite',
    intensity: 1.2,
  },
  happy: {
    eyeScaleY: 0.55,
    eyeRotate: 0,
    eyeOffsetY: 2,
    headScale: 1,
    bounce: 'grok-happy 1.8s ease-in-out infinite',
    intensity: 0.5,
  },
  curious: {
    eyeScaleY: 1.1,
    eyeRotate: 8,
    eyeOffsetY: -3,
    headScale: 1.02,
    bounce: 'grok-curious 2.2s ease-in-out infinite',
    intensity: 0.7,
  },
  sleepy: {
    eyeScaleY: 0.25,
    eyeRotate: 0,
    eyeOffsetY: 4,
    headScale: 0.98,
    bounce: 'grok-sleepy 3s ease-in-out infinite',
    intensity: 0.2,
  },
};

export const GrokBot = ({
  state = 'idle',
  size = 80,
  color = '#1a1a1a',
  eyeColor = '#f5f5f5',
  followCursor = true,
  className = '',
  label = 'Pilot',
  onClick,
}) => {
  const containerRef = useRef(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [blinking, setBlinking] = useState(false);
  const blinkTimeout = useRef();

  const config = STATE_CONFIG[state] || STATE_CONFIG.idle;

  // Cursor tracking
  const handlePointerMove = useCallback(
    (e) => {
      if (!followCursor || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Normalize to roughly -1 → 1
      const dx = (e.clientX - centerX) / (rect.width * 0.9);
      const dy = (e.clientY - centerY) / (rect.height * 0.9);

      // Clamp
      const x = Math.max(-1, Math.min(1, dx));
      const y = Math.max(-1, Math.min(1, dy));

      setGaze({ x, y });
    },
    [followCursor]
  );

  useEffect(() => {
    if (!followCursor) {
      setGaze({ x: 0, y: 0 });
      return;
    }

    window.addEventListener('pointermove', handlePointerMove);
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, [followCursor, handlePointerMove]);

  // Blinking
  useEffect(() => {
    let innerTimeout;
    const scheduleBlink = () => {
      const delay = 1800 + Math.random() * 3500;
      blinkTimeout.current = setTimeout(() => {
        setBlinking(true);
        innerTimeout = setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 130);
      }, delay);
    };

    scheduleBlink();
    return () => {
      if (blinkTimeout.current) clearTimeout(blinkTimeout.current);
      if (innerTimeout) clearTimeout(innerTimeout);
    };
  }, [state]);

  // Eye movement from gaze + state
  const eyeX = gaze.x * 6;
  const eyeY = gaze.y * 5 + config.eyeOffsetY;

  return (
    <div
      ref={containerRef}
      className={`grok-bot inline-block transition-transform duration-200 ${className}`}
      role="img"
      aria-label={label}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        animation: config.bounce,
        transform: `scale(${config.headScale})`,
        cursor: onClick ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        style={{ overflow: 'visible', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))' }}
      >
        {/* Head */}
        <circle cx="50" cy="50" r="46" fill={color} stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />

        {/* Left eye */}
        <g
          style={{
            transformOrigin: '34px 46px',
            transform: `
              translate(${eyeX}px, ${eyeY}px)
              rotate(${config.eyeRotate}deg)
              scaleY(${blinking ? 0.08 : config.eyeScaleY})
            `,
            transition: 'transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <rect
            x="28"
            y="32"
            width="12"
            height="28"
            rx="4"
            fill={eyeColor}
          />
        </g>

        {/* Right eye */}
        <g
          style={{
            transformOrigin: '66px 46px',
            transform: `
              translate(${eyeX}px, ${eyeY}px)
              rotate(${config.eyeRotate}deg)
              scaleY(${blinking ? 0.08 : config.eyeScaleY})
            `,
            transition: 'transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          <rect
            x="60"
            y="32"
            width="12"
            height="28"
            rx="4"
            fill={eyeColor}
          />
        </g>
      </svg>

      <style>{`
        @keyframes grok-loading-shake {
          0%, 100% { transform: translate(0, 0) rotate(0deg) scale(${config.headScale}); }
          15% { transform: translate(-2px, -3px) rotate(-2deg) scale(${config.headScale}); }
          30% { transform: translate(2px, 2px) rotate(1.5deg) scale(${config.headScale}); }
          45% { transform: translate(-1.5px, 2.5px) rotate(-1deg) scale(${config.headScale}); }
          60% { transform: translate(1.8px, -1.5px) rotate(1.2deg) scale(${config.headScale}); }
          75% { transform: translate(-1px, 1px) rotate(-0.6deg) scale(${config.headScale}); }
        }

        @keyframes grok-thinking {
          0%, 100% { transform: translateY(0) scale(${config.headScale}); }
          50% { transform: translateY(-4px) scale(${config.headScale * 1.02}); }
        }

        @keyframes grok-excited {
          0%, 100% { transform: translateY(0) scale(${config.headScale}); }
          40% { transform: translateY(-8px) scale(${config.headScale * 1.08}); }
          70% { transform: translateY(-2px) scale(${config.headScale * 1.03}); }
        }

        @keyframes grok-happy {
          0%, 100% { transform: translateY(0) rotate(0deg) scale(${config.headScale}); }
          25% { transform: translateY(-3px) rotate(-3deg) scale(${config.headScale}); }
          75% { transform: translateY(-3px) rotate(3deg) scale(${config.headScale}); }
        }

        @keyframes grok-curious {
          0%, 100% { transform: rotate(0deg) scale(${config.headScale}); }
          50% { transform: rotate(6deg) scale(${config.headScale * 1.03}); }
        }

        @keyframes grok-sleepy {
          0%, 100% { transform: translateY(0) scale(${config.headScale}); }
          50% { transform: translateY(3px) scale(${config.headScale * 0.97}); }
        }
      `}</style>
    </div>
  );
};

export default GrokBot;
