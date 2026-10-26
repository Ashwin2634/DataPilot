import React, { useEffect, useRef, useState, useCallback } from 'react';
import defaultCalmImg from '../assets/calm-character.png';

export const CartoonBot = ({
  state = 'vibing',
  size = 280,
  followCursor = true,
  className = '',
  label = 'Calm - Seedhe Maut',
  imageUrl = defaultCalmImg || '/calm-character.png',
  onClick,
  style = {},
  // Accept legacy props gracefully
  color,
  eyeColor,
  ...rest
}) => {
  const containerRef = useRef(null);
  const [layers, setLayers] = useState(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [blinking, setBlinking] = useState(false);
  const blinkTimeout = useRef();

  const isVibing =
    state === 'vibing' || state === 'loading' || state === 'excited';

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;

    img.onload = () => {
      const w = img.width;
      const h = img.height;

      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = w;
      baseCanvas.height = h;
      const ctx = baseCanvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // STEP 1: Flood-fill remove the outer grey/white checkerboard background
      const visited = new Uint8Array(w * h);
      const queue = [];

      const isCheckerboard = (idx) => {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const diff = Math.max(r, g, b) - Math.min(r, g, b);
        return diff < 20 && r > 170;
      };

      for (let x = 0; x < w; x++) queue.push(x);
      for (let y = 0; y < h; y++) {
        queue.push(y * w);
        queue.push(y * w + (w - 1));
      }

      while (queue.length > 0) {
        const p = queue.pop();
        if (visited[p]) continue;
        visited[p] = 1;

        const idx = p * 4;
        if (isCheckerboard(idx)) {
          data[idx + 3] = 0;
          const cx = p % w;
          const cy = Math.floor(p / w);
          if (cx > 0 && !visited[p - 1]) queue.push(p - 1);
          if (cx < w - 1 && !visited[p + 1]) queue.push(p + 1);
          if (cy > 0 && !visited[p - w]) queue.push(p - w);
          if (cy < h - 1 && !visited[p + w]) queue.push(p + w);
        }
      }

      // STEP 2: SURGICALLY REMOVE ONLY THE EYEBALLS FROM THE ORIGINAL IMAGE
      // Finds the horizontal eyelid line first, then replaces ONLY the dark eyeball
      // pixels directly below that line with the exact eye-white color (#eefbfb).
      const removeEyeballFromImage = (minX, maxX) => {
        for (let x = Math.floor(w * minX); x <= Math.ceil(w * maxX); x++) {
          // 1. Locate the dark horizontal eyelid line in this vertical column
          let lidBottomY = Math.floor(h * 0.478);
          for (let y = Math.floor(h * 0.455); y <= Math.floor(h * 0.495); y++) {
            const idx = (y * w + x) * 4;
            // Eyelid line is dark, while the upper lid above it is medium grey-brown
            if (data[idx] < 95 && data[idx + 1] < 95) {
              lidBottomY = y;
            }
          }

          // 2. Erase any dark eyeball pixels below the eyelid line down to the middle of the eye
          for (let y = lidBottomY - 2; y <= Math.floor(h * 0.545); y++) {
            const idx = (y * w + x) * 4;
            // Keep a crisp 4px eyelid line at the top, and turn the eyeball below it pure sclera white
            if (y > lidBottomY + 1 && data[idx] < 225) {
              data[idx] = 238;     // R (#eefbfb - exact white of Calm's eyes)
              data[idx + 1] = 251; // G
              data[idx + 2] = 251; // B
            }
          }
        }
      };

      // Erase Left Eyeball (X: 34% to 44%) and Right Eyeball (X: 55% to 65%)
      removeEyeballFromImage(0.34, 0.44);
      removeEyeballFromImage(0.55, 0.65);

      // STEP 3: Create the HEAD Layer (Erase the orange shirt & collar below the beard/jawline)
      const headCanvas = document.createElement('canvas');
      headCanvas.width = w;
      headCanvas.height = h;
      const headCtx = headCanvas.getContext('2d');
      const headData = new ImageData(new Uint8ClampedArray(data), w, h);
      const hd = headData.data;

      for (let y = Math.floor(h * 0.72); y < h; y++) {
        const ny = y / h;
        for (let x = 0; x < w; x++) {
          const nx = x / w;
          const idx = (y * w + x) * 4;
          const r = hd[idx];
          const g = hd[idx + 1];
          const b = hd[idx + 2];

          const distFromCenter = Math.abs(nx - 0.5);
          const jawCurveY =
            distFromCenter < 0.14
              ? 0.96 - distFromCenter * 0.4
              : 0.90 - (distFromCenter - 0.14) * 0.72;

          const isOrangeShirt = r > 175 && g > 65 && g < 175 && b < 75;
          const isPinkCollar =
            r > 210 && g > 150 && b > 125 && distFromCenter > 0.16 && ny > 0.76;
          const isPurpleHair = b > r && distFromCenter > 0.26 && ny < 0.87;

          if (!isPurpleHair && (ny > jawCurveY || isOrangeShirt || isPinkCollar)) {
            hd[idx + 3] = 0;
          }
        }
      }
      headCtx.putImageData(headData, 0, 0);

      // STEP 4: Create the Stationary BODY Layer (Shirt + Solid Neck/Chest buffer underneath)
      const bodyCanvas = document.createElement('canvas');
      bodyCanvas.width = w;
      bodyCanvas.height = h;
      const bodyCtx = bodyCanvas.getContext('2d');

      bodyCtx.fillStyle = '#6f4e4d';
      bodyCtx.beginPath();
      bodyCtx.ellipse(w * 0.5, h * 0.82, w * 0.26, h * 0.1, 0, 0, Math.PI * 2);
      bodyCtx.fill();

      const bodyData = new ImageData(new Uint8ClampedArray(data), w, h);
      const bd = bodyData.data;
      for (let y = 0; y < h; y++) {
        const ny = y / h;
        for (let x = 0; x < w; x++) {
          const nx = x / w;
          const idx = (y * w + x) * 4;
          const b = bd[idx + 2];
          const r = bd[idx];
          const distFromCenter = Math.abs(nx - 0.5);

          const isOuterPurpleCurls = distFromCenter > 0.28 && b > r && ny < 0.87;
          if (ny < 0.75 || isOuterPurpleCurls) {
            bd[idx + 3] = 0;
          }
        }
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      tempCanvas.getContext('2d').putImageData(bodyData, 0, 0);
      bodyCtx.drawImage(tempCanvas, 0, 0);

      setLayers({
        head: headCanvas.toDataURL('image/png'),
        body: bodyCanvas.toDataURL('image/png'),
      });
    };
  }, [imageUrl]);

  // Cursor tracking for smooth eyeball movement
  const handlePointerMove = useCallback(
    (e) => {
      if (!followCursor || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = (e.clientX - centerX) / (window.innerWidth * 0.35);
      const dy = (e.clientY - centerY) / (window.innerHeight * 0.35);

      setGaze({
        x: Math.max(-1, Math.min(1, dx)),
        y: Math.max(-1, Math.min(1, dy)),
      });
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

  // Natural Blinking Loop
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 3000;
      blinkTimeout.current = setTimeout(() => {
        setBlinking(true);
        setTimeout(() => {
          setBlinking(false);
          scheduleBlink();
        }, 140);
      }, delay);
    };
    scheduleBlink();
    return () => {
      if (blinkTimeout.current) clearTimeout(blinkTimeout.current);
    };
  }, []);

  // Eyeball movement range inside the natural eye whites
  const pupilOffsetX = gaze.x * 32;
  const pupilOffsetY = Math.max(-6, Math.min(28, gaze.y * 20));

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label={label}
      onClick={onClick}
      style={{
        width: size,
        height: size * 1.124,
        display: 'inline-block',
        position: 'relative',
        lineHeight: 0,
        userSelect: 'none',
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
      {...rest}
    >
      {layers && (
        <>
          {/* 1. STATIONARY BODY & SHIRT LAYER */}
          <img
            src={layers.body}
            alt="Calm Shirt Base"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          />

          {/* 2. HEAD LAYER (Original Image with Eyeballs Removed + Floating Coded Eyeballs) */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              animation: isVibing
                ? 'bure-din-head-nod 0.46s ease-in-out infinite alternate'
                : 'none',
              transformOrigin: '50% 80%',
              pointerEvents: 'none',
            }}
          >
            {/* Original Hand-Drawn Head Image (with static eyeballs cleanly erased) */}
            <img
              src={layers.head}
              alt="Calm Head"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />

            {/* 3. ONLY THE FLOATING CODED EYEBALLS (No overdrawn lines or white boxes!) */}
            <svg
              viewBox="0 0 1000 1124"
              width="100%"
              height="100%"
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
              }}
            >
              <defs>
                {/* Invisible clip boundary so the floating eyeballs tuck cleanly under the original eyelid */}
                <clipPath id="left-eye-natural-clip">
                  <path d="M 248 534 L 488 534 C 492 615 440 660 368 660 C 295 660 244 612 248 534 Z" />
                </clipPath>
                <clipPath id="right-eye-natural-clip">
                  <path d="M 514 534 L 762 534 C 765 612 715 660 638 660 C 560 660 510 615 514 534 Z" />
                </clipPath>
              </defs>

              {/* Floating Coded Eyeballs Only */}
              {!blinking && (
                <>
                  <g clipPath="url(#left-eye-natural-clip)">
                    <circle
                      cx={388 + pupilOffsetX}
                      cy={545 + pupilOffsetY}
                      r="18.5"
                      fill="#1d2c36"
                    />
                  </g>
                  <g clipPath="url(#right-eye-natural-clip)">
                    <circle
                      cx={604 + pupilOffsetX}
                      cy={545 + pupilOffsetY}
                      r="18.5"
                      fill="#1d2c36"
                    />
                  </g>
                </>
              )}

              {/* Blinking Eyelid (Only appears for 140ms during a blink) */}
              {blinking && (
                <g>
                  <path
                    d="M 244 531 L 490 531 C 494 618 442 664 368 664 C 292 664 240 615 244 531 Z"
                    fill="#b89d92"
                    stroke="#221e26"
                    strokeWidth="8"
                  />
                  <path
                    d="M 512 531 L 765 531 C 768 615 718 664 638 664 C 558 664 508 618 512 531 Z"
                    fill="#b89d92"
                    stroke="#221e26"
                    strokeWidth="8"
                  />
                </g>
              )}
            </svg>
          </div>
        </>
      )}

      {/* Smooth Rhythmic Head Nod */}
      <style>{`
        @keyframes bure-din-head-nod {
          0% {
            transform: translateY(0px);
          }
          100% {
            transform: translateY(4.5%);
          }
        }
      `}</style>
    </div>
  );
};

export const GrokBot = CartoonBot;
export const CalmBot = CartoonBot;
export default CartoonBot;
