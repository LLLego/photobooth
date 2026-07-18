/**
 * Virtual camera — generates a canvas-based MediaStream when real camera
 * hardware is unavailable. Creates animated test patterns that simulate
 * a live camera feed for testing the full photo capture pipeline.
 */

let virtualStream = null;

function createAnimatedCanvas(width = 640, height = 480) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  let frame = 0;

  function drawFrame() {
    frame++;
    const t = frame / 60; // seconds at ~60fps

    // Animated gradient background
    const hue1 = (t * 30) % 360;
    const hue2 = (t * 30 + 60) % 360;
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, `hsl(${hue1}, 70%, 60%)`);
    grad.addColorStop(0.5, `hsl(${(hue1 + hue2) / 2}, 60%, 65%)`);
    grad.addColorStop(1, `hsl(${hue2}, 70%, 60%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Moving circles
    for (let i = 0; i < 5; i++) {
      const cx = width * 0.3 + Math.sin(t * 1.3 + i * 1.7) * width * 0.35;
      const cy = height * 0.4 + Math.cos(t * 0.9 + i * 2.1) * height * 0.3;
      const r = 25 + Math.sin(t * 2 + i) * 10;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${(hue1 + i * 60) % 360}, 50%, 75%, 0.6)`;
      ctx.fill();
    }

    // Heart in center
    const hx = width / 2;
    const hy = height / 2 - 30;
    const hs = 40 + Math.sin(t * 3) * 8;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(hs / 40, hs / 40);
    ctx.fillStyle = 'rgba(220, 80, 90, 0.8)';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.bezierCurveTo(-20, -35, -35, -10, 0, 10);
    ctx.bezierCurveTo(35, -10, 20, -35, 0, -10);
    ctx.fill();
    ctx.restore();

    // Text label
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.font = `${Math.max(14, width / 25)}px "DM Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Virtual Camera · Testing', width / 2, height - 20);

    requestAnimationFrame(drawFrame);
  }

  requestAnimationFrame(drawFrame);
  return canvas;
}

export function createVirtualCameraStream(width = 640, height = 480) {
  if (virtualStream) {
    // Stop existing stream tracks
    virtualStream.getTracks().forEach(t => t.stop());
  }
  const canvas = createAnimatedCanvas(width, height);
  virtualStream = canvas.captureStream(30); // 30 fps
  return virtualStream;
}

export function stopVirtualCamera() {
  if (virtualStream) {
    virtualStream.getTracks().forEach(t => t.stop());
    virtualStream = null;
  }
}

export function hasVirtualCamera() {
  return virtualStream !== null;
}
