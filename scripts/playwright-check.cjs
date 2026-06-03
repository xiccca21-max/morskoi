const { chromium } = require('playwright');

(async () => {
  const api = [];
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('request', (r) => {
    if (r.url().includes('/api/')) api.push(r.url());
  });
  await page.goto('https://game.navalclash.ru/', { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(4000);
  const boot = await page.locator('.boot').count();
  console.log('boot_visible', boot > 0);
  console.log('api_requests', api.join(' '));
  await browser.close();
  process.exit(boot > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
