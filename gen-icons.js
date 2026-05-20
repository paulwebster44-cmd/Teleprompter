// Run once: node gen-icons.js
const { createCanvas } = require('canvas');
const fs = require('fs');

function drawIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const s = size / 512;

  // Background
  ctx.fillStyle = '#0a0a14';
  roundRect(ctx, 0, 0, size, size, 96 * s);
  ctx.fill();

  // Screen body
  ctx.strokeStyle = '#56cef2';
  ctx.lineWidth = 10 * s;
  ctx.fillStyle = '#13131f';
  roundRect(ctx, 72*s, 120*s, 368*s, 236*s, 20*s);
  ctx.fill();
  ctx.stroke();

  // Text lines
  const lines = [
    { y: 188, a: 1.0, w: 280 },
    { y: 228, a: 0.55, w: 280 },
    { y: 268, a: 0.55, w: 280 },
    { y: 308, a: 0.55, w: 164 },
  ];
  lines.forEach(({ y, a, w }) => {
    ctx.strokeStyle = `rgba(86,206,242,${a})`;
    ctx.lineWidth = 14 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(116*s, y*s);
    ctx.lineTo((116+w)*s, y*s);
    ctx.stroke();
  });

  // Stand neck
  ctx.fillStyle = '#56cef2';
  roundRect(ctx, 240*s, 356*s, 32*s, 52*s, 10*s);
  ctx.fill();

  // Stand base
  roundRect(ctx, 180*s, 400*s, 152*s, 24*s, 12*s);
  ctx.fill();

  return c.toBuffer('image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

try {
  fs.writeFileSync('icon-192.png', drawIcon(192));
  fs.writeFileSync('icon-512.png', drawIcon(512));
  console.log('Icons generated.');
} catch (e) {
  console.error('canvas module not available, skipping PNG icons:', e.message);
}
