const { chromium } = require('playwright');

(async () => {
  const errors = [];
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`FAIL ${r.url()} ${r.failure()?.errorText || ''}`));
  await page.goto('https://game.navalclash.ru/', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(3000);
  const url = page.url();
  const rootHtml = await page.locator('#root').innerHTML();
  const rootText = await page.locator('#root').innerText().catch(() => '');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const authUi = await page.getByText(/Не удалось|Telegram|только в Telegram|авториз/i).count();
  const homeUi = await page.getByText(/В бой|Главная|ставк|кошел|Дуэль/i).count();
  const bootUi = await page.getByText(/^Загрузка$/).count();
  const isStaticBoot = rootHtml.includes('boot__title');
  const isReactSplash = rootHtml.includes('min-h-[100dvh]') || rootHtml.includes('min-h-\\[100dvh\\]');
  console.log('final_url', url);
  console.log('static_boot_html', isStaticBoot);
  console.log('react_splash', isReactSplash);
  console.log('root_content_len', rootHtml.length);
  console.log('root_text', rootText.slice(0, 300).replace(/\s+/g, ' '));
  console.log('body_text', bodyText.slice(0, 400).replace(/\s+/g, ' '));
  console.log('boot_ui', bootUi > 0);
  console.log('auth_ui', authUi > 0);
  console.log('home_ui', homeUi > 0);
  console.log('js_errors', errors.join(' | ') || 'none');
  await browser.close();
  const reactStarted = isReactSplash || isStaticBoot === false;
  const hasAppUi = authUi > 0 || homeUi > 0;
  const ok = reactStarted && (hasAppUi || authUi > 0) && !isStaticBoot;
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(2);
});
