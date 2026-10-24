// QA visual da landing da marca: captura claro/escuro, desktop e mobile.
// Uso: NODE_PATH=/usr/local/lib/node_modules node tools/shot-landing.js
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const OUT = path.join(__dirname, '..', '.shots');
const CHROME = '/root/.cache/ms-playwright/chromium-1243/chrome-linux/chrome';

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {})
  });
  const shots = [
    { name: 'landing-desktop-claro', path: '/', width: 1280, height: 900, scheme: 'light' },
    { name: 'landing-desktop-escuro', path: '/', width: 1280, height: 900, scheme: 'dark' },
    { name: 'landing-mobile-claro', path: '/', width: 390, height: 844, scheme: 'light' },
    { name: 'tax-desktop-claro', path: '/tax/', width: 1280, height: 900, scheme: 'light' }
  ];
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, colorScheme: s.scheme });
    const page = await ctx.newPage();
    const erros = [];
    page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
    page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
    const resp = await page.goto(BASE + s.path, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT, s.name + '.png'), fullPage: true });
    console.log(`${s.name}  status=${resp && resp.status()}  erros=${erros.length ? erros.join(' | ') : 'nenhum'}`);
    await ctx.close();
  }
  await browser.close();
})();
