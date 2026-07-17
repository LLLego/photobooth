const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const baseUrl = 'http://127.0.0.1:4173/photobooth/';
const outputDir = path.resolve('.verify-temp/evidence');
fs.mkdirSync(outputDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 430, height: 932 },
    permissions: ['camera'],
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.addInitScript(() => {
    localStorage.setItem('photobooth:prefs', JSON.stringify({
      themeId: 'minimal',
      layout: 'strip_4',
      aspectRatio: '3:4',
      countdownDuration: 0.35,
      filterId: 'warm',
      zoom: 1.35,
      mirror: true,
      flashEnabled: true,
    }));

    const source = document.createElement('canvas');
    source.width = 640;
    source.height = 480;
    const ctx = source.getContext('2d');
    let frame = 0;
    const draw = () => {
      frame += 1;
      const gradient = ctx.createLinearGradient(0, 0, source.width, source.height);
      gradient.addColorStop(0, '#d4956a');
      gradient.addColorStop(1, '#ffb400');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, source.width, source.height);
      ctx.fillStyle = '#2d1b11';
      ctx.fillRect(55, 80, 180, 300);
      ctx.fillStyle = '#fffaf0';
      ctx.font = 'bold 54px Georgia';
      ctx.fillText(`MOCK ${frame % 10}`, 270, 245);
      requestAnimationFrame(draw);
    };
    draw();
    const stream = source.captureStream(30);
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = async () => stream;
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'mock-camera', label: 'Mock camera' }];
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => { location.hash = '#/single'; });
  await page.waitForSelector('.camera-live-canvas');
  await page.waitForFunction(() => {
    const button = document.querySelector('.capture-button');
    const canvas = document.querySelector('.camera-live-canvas');
    return button && !button.disabled && canvas && canvas.width > 0;
  }, null, { timeout: 15000 });

  const initial = await page.evaluate(() => {
    const canvas = document.querySelector('.camera-live-canvas');
    const ctx = canvas.getContext('2d');
    const center = Array.from(ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data);
    return {
      canvas: { width: canvas.width, height: canvas.height, center },
      frameLoaded: Boolean(document.querySelector('.camera-frame-source')?.naturalWidth),
      count: document.querySelector('header span, .text-sm')?.textContent,
      slots: document.querySelectorAll('.capture-thumbnail').length,
      filled: document.querySelectorAll('.capture-thumbnail.is-filled').length,
      captureDisabled: document.querySelector('.capture-button').disabled,
    };
  });
  await page.click('button:has-text("Warm")');
  await page.locator('input[type="range"]').evaluate((slider) => {
    slider.value = '1.35';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(120);
  const adjusted = await page.evaluate(() => {
    const canvas = document.querySelector('.camera-live-canvas');
    const ctx = canvas.getContext('2d');
    const y = Math.floor(canvas.height / 2);
    const left = Array.from(ctx.getImageData(Math.floor(canvas.width * 0.2), y, 1, 1).data);
    const right = Array.from(ctx.getImageData(Math.floor(canvas.width * 0.8), y, 1, 1).data);
    return {
      filterActive: document.querySelector('button[data-filter="warm"]')?.classList.contains('bg-warmth-900'),
      zoomLabel: Array.from(document.querySelectorAll('span')).map((span) => span.textContent).find((text) => text === '1.4x'),
      mirroredPixels: { left, right },
    };
  });
  await page.screenshot({ path: path.join(outputDir, '01-live-preview.png'), fullPage: true });

  await page.click('.capture-button');
  await page.waitForSelector('.countdown-number');
  const countdown = await page.locator('.countdown-number').textContent();
  await page.screenshot({ path: path.join(outputDir, '02-countdown.png') });

  await page.waitForFunction(() => document.querySelector('.countdown-number')?.textContent === 'SNAP!', null, { timeout: 5000 });
  const snap = await page.locator('.countdown-number').textContent();
  const snapClass = await page.locator('.countdown-number').getAttribute('class');
  await page.screenshot({ path: path.join(outputDir, '03-snap.png') });

  await page.waitForFunction(() => document.querySelectorAll('.capture-thumbnail.is-filled').length >= 1, null, { timeout: 10000 });
  const duringSequence = await page.evaluate(() => ({
    filled: document.querySelectorAll('.capture-thumbnail.is-filled').length,
    status: Array.from(document.querySelectorAll('p')).map((p) => p.textContent).find((text) => text.includes('Photo')),
    buttonDisabled: document.querySelector('.capture-button').disabled,
  }));

  await page.waitForSelector('.strip-preview img', { timeout: 30000 });
  const final = await page.evaluate(() => ({
    filled: document.querySelectorAll('.capture-thumbnail.is-filled').length,
    slots: document.querySelectorAll('.capture-thumbnail').length,
    resultReady: Boolean(document.querySelector('.strip-preview img')?.naturalWidth),
    finalActionsVisible: !document.querySelector('[data-final]')?.classList.contains('hidden'),
    status: Array.from(document.querySelectorAll('p')).map((p) => p.textContent).find((text) => text.includes('Ready to save')),
    count: Array.from(document.querySelectorAll('span')).map((span) => span.textContent).find((text) => text.includes('photos')),
    flashAnimations: document.getAnimations().filter((animation) => animation.animationName === 'flash').length,
  }));
  await page.screenshot({ path: path.join(outputDir, '04-final-strip.png'), fullPage: true });

  await page.click('button:has-text("Start over")');
  const reset = await page.evaluate(() => ({
    filled: document.querySelectorAll('.capture-thumbnail.is-filled').length,
    slots: document.querySelectorAll('.capture-thumbnail').length,
    captureDisabled: document.querySelector('.capture-button').disabled,
    finalHidden: document.querySelector('[data-final]')?.classList.contains('hidden'),
  }));
  await page.screenshot({ path: path.join(outputDir, '05-reset.png'), fullPage: true });

  await page.click('button[title="Toggle flash"]');
  const flashToggle = await page.locator('button[title="Toggle flash"]').textContent();
  await page.click('.capture-button');
  await page.waitForFunction(() => document.querySelector('.countdown-number')?.textContent === 'SNAP!', null, { timeout: 5000 });
  const flashOffProbe = await page.evaluate(() => ({
    flashElements: document.querySelectorAll('.flash-overlay').length,
    snapVisible: document.querySelector('.countdown-number')?.textContent,
  }));
  await page.screenshot({ path: path.join(outputDir, '06-flash-off.png') });

  console.log(JSON.stringify({ initial, adjusted, countdown, snap, snapClass, duringSequence, final, reset, flashToggle, flashOffProbe, consoleErrors }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
