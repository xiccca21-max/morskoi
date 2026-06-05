/**
 * Проверка старта без двойного reload и без lazy-чанка Home на /home.
 * Запуск: node scripts/boot-flicker-test.mjs [url]
 */
import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://127.0.0.1:4173/';

const browser = await chromium.launch();
const page = await browser.newPage();

let reloads = 0;
let homeChunkRequests = 0;
page.on('framenavigated', (frame) => {
  if (frame === page.mainFrame()) reloads += 1;
});
page.on('request', (req) => {
  const u = req.url();
  if (/HomeScreen/i.test(u)) homeChunkRequests += 1;
});

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);

const html = await page.locator('#root').innerHTML();
const hasBoot = html.includes('boot__title');
const hasSplash = html.includes('splash-wheel') || html.includes('min-h-[100dvh]');
const hasLayout = html.includes('logo-pulse') || (await page.getByText(/Морской/i).count()) > 1;
const authUi = await page.getByText(/Telegram|Не удалось|только в Telegram/i).count();

console.log('url', page.url());
console.log('navigations', reloads);
console.log('home_lazy_chunk_requests', homeChunkRequests);
console.log('static_boot', hasBoot);
console.log('react_splash', hasSplash);
console.log('layout_or_home', hasLayout);
console.log('auth_ui', authUi > 0);
console.log('js_errors', errors.join(' | ') || 'none');

await browser.close();

const ok = reloads <= 1 && homeChunkRequests === 0 && !hasBoot && errors.length === 0;
process.exit(ok ? 0 : 1);
