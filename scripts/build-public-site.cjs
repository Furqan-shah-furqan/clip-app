// Standalone public website. Never copy account pages, APIs, or customer data.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'public');
const output = path.join(root, 'static-public');
const app = 'https://clip-clipflow-studio.onrender.com';
const pages = ['welcome', 'privacy', 'terms', 'support', 'data-deletion'];
const assets = ['customer.css', 'public-site.css', 'public-site.js', 'navigation.css', 'navigation.js', 'fonts/Inter.ttf'];

fs.rmSync(output, {recursive: true, force: true});
fs.mkdirSync(output, {recursive: true});
function appLinks(text) {
  return text.replace(/(["'`])\/(account|settings|profile|index|captions|publish)\.html/g, '$1' + app + '/$2.html');
}
for (const name of pages) {
  const html = appLinks(fs.readFileSync(path.join(source, name + '.html'), 'utf8'));
  fs.writeFileSync(path.join(output, name + '.html'), html);
}
// Render serves index.html at /. Keep welcome.html for existing public links.
fs.copyFileSync(path.join(output, 'welcome.html'), path.join(output, 'index.html'));
for (const name of assets) {
  const destination = path.join(output, name);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  if (name.endsWith('.js')) {
    fs.writeFileSync(destination, appLinks(fs.readFileSync(path.join(source, name), 'utf8')));
  } else {
    fs.copyFileSync(path.join(source, name), destination);
  }
}
fs.writeFileSync(path.join(output, 'robots.txt'), 'User-agent: *\nAllow: /\n');
// Fail the deploy if a page's local links/assets are missing or login points here.
for (const name of [...pages, 'index']) {
  const html = fs.readFileSync(path.join(output, name + '.html'), 'utf8');
  assert.match(html, /ClipFlow/);
  assert.match(html, /href="\/privacy.html"/);
  assert.match(html, /https:\/\/clip-clipflow-studio.onrender.com\/account.html/);
  for (const match of html.matchAll(/(?:href|src)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)) {
    assert.ok(fs.existsSync(path.join(output, match[1])), name + ': missing ' + match[1]);
  }
}
const navigation = fs.readFileSync(path.join(output, 'navigation.js'), 'utf8');
assert.match(navigation, /https:\/\/clip-clipflow-studio.onrender.com\/settings.html/);
assert.match(navigation, /https:\/\/clip-clipflow-studio.onrender.com\/profile.html/);
assert.match(fs.readFileSync(path.join(output, 'index.html'), 'utf8'), /22gwkSl9mUbFhQ5ZBCt5yf0LDtIGV4VV36oyRPhuBjs/);
assert.ok(!fs.existsSync(path.join(output, 'account.html')));
console.log('Public site built and checked: static-public (6 pages, shared theme, font, public robots.txt).');
