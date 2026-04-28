const { chromium } = require('@playwright/test');
const fs = require('fs');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const networkRequests = [];
  const apiResponses = {};

  page.on('request', req => {
    if (req.url().includes('/api/')) {
      networkRequests.push({ method: req.method(), url: req.url() });
    }
  });
  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      try {
        const body = await res.json();
        const key = res.url().replace('http://localhost:5000', '');
        apiResponses[key] = Array.isArray(body)
          ? { count: body.length, sample: body[0] }
          : body;
      } catch(e) {}
    }
  });

  const report = {};

  // 1. LOGIN
  await page.goto('http://localhost:5000');
  await page.waitForTimeout(2000);
  report.login = {
    visibleText: await page.evaluate(() => document.body.innerText.slice(0, 600)),
  };

  await page.fill('[data-testid="login-username"]', 'Admin');
  await page.fill('[data-testid="login-password"]', 'OnyxCCD');
  await page.click('[data-testid="login-submit"]');
  await page.waitForTimeout(3000);
  report.afterLoginUrl = page.url();
  report.afterLoginText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  report.loginSuccess = !report.afterLoginText.includes('ACCESS SYSTEM');

  async function capturePage(name, path) {
    await page.goto('http://localhost:5000/#' + path);
    await page.waitForTimeout(3500);
    return {
      url: page.url(),
      title: await page.evaluate(() => document.querySelector('h1')?.innerText || ''),
      bodyText: await page.evaluate(() => document.body.innerText.slice(0, 3000)),
      buttons: await page.evaluate(() => {
        const btns = [];
        document.querySelectorAll('button').forEach(b => {
          const t = b.innerText.trim();
          if (t) btns.push(t);
        });
        return [...new Set(btns)].slice(0, 20);
      }),
      selects: await page.evaluate(() => {
        const sels = [];
        document.querySelectorAll('select').forEach(s => {
          sels.push({ id: s.id || s.dataset.testid || '', options: Array.from(s.options).map(o => o.value) });
        });
        return sels;
      }),
      tables: await page.evaluate(() => {
        const tables = [];
        document.querySelectorAll('table').forEach(t => {
          const headers = Array.from(t.querySelectorAll('th')).map(th => th.innerText.trim());
          const firstRow = Array.from(t.querySelectorAll('tbody tr:first-child td')).map(td => td.innerText.trim().slice(0,40));
          tables.push({ headers, firstRow });
        });
        return tables;
      }),
    };
  }

  report.dashboard = await capturePage('dashboard', '/');
  report.pipeline = await capturePage('pipeline', '/pipeline');
  report.production = await capturePage('production', '/production');
  report.pressLog = await capturePage('pressLog', '/press-log');
  report.environment = await capturePage('environment', '/environment');
  report.finance = await capturePage('finance', '/finance');
  report.maintenance = await capturePage('maintenance', '/maintenance');
  report.inventory = await capturePage('inventory', '/inventory');
  report.shipping = await capturePage('shipping', '/shipping');
  report.leads = await capturePage('leads', '/leads');
  report.vendors = await capturePage('vendors', '/vendors');

  report.networkRequests = networkRequests;
  report.apiResponseSamples = apiResponses;
  const uniqueEndpoints = [...new Set(networkRequests.map(r => r.method + ' ' + r.url.replace('http://localhost:5000','')))];
  report.uniqueApiEndpoints = uniqueEndpoints;

  await browser.close();
  fs.writeFileSync('playwright-report.json', JSON.stringify(report, null, 2));
  console.log('Done. Login success:', report.loginSuccess);
  console.log('API endpoints found:', uniqueEndpoints.length);
  uniqueEndpoints.forEach(e => console.log(' ', e));
}

run().catch(console.error);
