const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

function getMauticPath() {
  const envFile = '/tmp/mautic-whitelabeler-test/.env';
  if (fs.existsSync(envFile)) {
    const content = fs.readFileSync(envFile, 'utf8');
    const match = content.match(/MAUTIC_PATH=(.+)/);
    if (match) return match[1].trim();
  }
  return process.env.MAUTIC_PATH || '/tmp/mautic-whitelabeler-test/mautic';
}

// Strip Twig syntax for static rendering
function stripTwig(html) {
  return html
    .replace(/\{%-?[\s\S]*?-?%\}/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .replace(/\{#[\s\S]*?#\}/g, '');
}

let mauticPath;

test.beforeAll(() => {
  mauticPath = getMauticPath();
});

test.describe('File content verification', () => {

  test('login template contains company name', () => {
    const templatePath = path.join(
      mauticPath,
      'app/bundles/UserBundle/Resources/views/Security/base.html.twig'
    );
    expect(fs.existsSync(templatePath), `Template not found: ${templatePath}`).toBeTruthy();
    const content = fs.readFileSync(templatePath, 'utf8');
    expect(content).toContain('TestCorp');
  });

  test('login template uses custom logo, not SVG', () => {
    const templatePath = path.join(
      mauticPath,
      'app/bundles/UserBundle/Resources/views/Security/base.html.twig'
    );
    const content = fs.readFileSync(templatePath, 'utf8');
    expect(content).toContain('login_logo.png');
    expect(content).toContain('<img');
    expect(content).not.toContain('logo--minimized.svg');
    expect(content).not.toContain('<path class="circle"');
  });

  test('sidebar template contains logo image', () => {
    const sidebarPath = path.join(
      mauticPath,
      'app/bundles/CoreBundle/Resources/views/LeftPanel/index.html.twig'
    );
    expect(fs.existsSync(sidebarPath), `Sidebar template not found: ${sidebarPath}`).toBeTruthy();
    const content = fs.readFileSync(sidebarPath, 'utf8');
    expect(content).toContain('sidebar_logo.png');
    expect(content).toContain('<img');
    expect(content).toContain('sidebar-header');
  });

  test('app.css contains whitelabeler color overrides', () => {
    const cssPath = path.join(
      mauticPath,
      'app/bundles/CoreBundle/Assets/css/app.css'
    );
    expect(fs.existsSync(cssPath), `app.css not found: ${cssPath}`).toBeTruthy();
    const content = fs.readFileSync(cssPath, 'utf8');
    expect(content).toContain('#123456');   // logo_bg
    expect(content).toContain('#2c3e50');   // sidebar_bg
    expect(content).toContain('Mautic Whitelabeler Custom Color Overrides');
  });

  test('libraries.css contains primary color override', () => {
    const cssPath = path.join(
      mauticPath,
      'app/bundles/CoreBundle/Assets/css/libraries/libraries.css'
    );
    const content = fs.readFileSync(cssPath, 'utf8');
    expect(content).toContain('#4e5e9e');   // primary
    expect(content).toContain('#3d4d8d');   // hover
  });

  test('1a.content.js contains company name', () => {
    const jsPath = path.join(
      mauticPath,
      'app/bundles/CoreBundle/Assets/js/1a.content.js'
    );
    const content = fs.readFileSync(jsPath, 'utf8');
    expect(content).toContain('TestCorp');
  });

  test('base template footer contains company name', () => {
    const basePath = path.join(
      mauticPath,
      'app/bundles/CoreBundle/Resources/views/Default/base.html.twig'
    );
    const content = fs.readFileSync(basePath, 'utf8');
    expect(content).toContain('TestCorp');
  });

});

test.describe('Visual rendering', () => {

  test('login page renders with company name in title', async ({ page }) => {
    const templatePath = path.join(
      mauticPath,
      'app/bundles/UserBundle/Resources/views/Security/base.html.twig'
    );
    let html = fs.readFileSync(templatePath, 'utf8');
    html = stripTwig(html);

    const staticPath = '/tmp/mautic-whitelabeler-test/login-test.html';
    fs.mkdirSync(path.dirname(staticPath), { recursive: true });
    fs.writeFileSync(staticPath, html);

    await page.goto('http://localhost:8888/login-test.html');
    const title = await page.title();
    expect(title).toContain('TestCorp');
  });

  test('screenshot - login page with branding', async ({ page }) => {
    const templatePath = path.join(
      mauticPath,
      'app/bundles/UserBundle/Resources/views/Security/base.html.twig'
    );
    let html = fs.readFileSync(templatePath, 'utf8');

    // Inline first 5000 chars of app.css for visual context
    const cssPath = path.join(mauticPath, 'app/bundles/CoreBundle/Assets/css/app.css');
    const cssSnippet = fs.existsSync(cssPath)
      ? `<style>${fs.readFileSync(cssPath, 'utf8').slice(0, 5000)}</style>`
      : '';

    html = stripTwig(html);
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8">${cssSnippet}</head><body>${html}</body></html>`;

    const staticPath = '/tmp/mautic-whitelabeler-test/login-screenshot.html';
    fs.writeFileSync(staticPath, fullHtml);

    fs.mkdirSync('test-results', { recursive: true });
    await page.goto('http://localhost:8888/login-screenshot.html');
    await page.screenshot({ path: 'test-results/login-branding.png', fullPage: true });

    await expect(page).toHaveURL(/login-screenshot/);
    // Logo img tag must be present in DOM
    const logoImg = page.locator('.mautic-logo img');
    await expect(logoImg).toBeAttached();
  });

});
