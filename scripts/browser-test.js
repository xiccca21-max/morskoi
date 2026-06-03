const { chromium } = require('playwright');

(async () => {
  const api = [];
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  page.on('request', (r) => {
    if (r.url().includes('/api/')) api.push(r.url());
  });
  page.on('pageerror', (e) => console.log('PAGE_ERROR', e.message));
  await page.goto('https://game.navalclash.ru/', {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForTimeout(5000);
  const boot = await page.locator('.boot').count();
  const splash = await page.locator('.splash, [class*="splash"]').count();
  const authErr = await page.getByText(/Telegram|авториз|В бой/i).count();
  console.log('boot_visible', boot > 0);
  console.log('splash_or_ui', splash > 0 || authErr > 0);
  console.log('api_requests', api.join(' '));
  console.log('title', await page.title());
  await browser.close();
  if (boot > 0) process.exit(1);
  process.exit(0);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
