// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package.
// Source delivery is a deterministic HTTP fixture. YouTube provider availability
// is a separate integration check, not asserted by this browser smoke test.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const base = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
  const fixture = path.resolve('scratch/editor-smoke-source.mp4');
  assert(fs.existsSync(fixture), 'Generate scratch/editor-smoke-source.mp4 before running');
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:1365,height:768}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let sourceRequests = 0;
  const realYouTube = process.env.SMOKE_REAL_YOUTUBE === '1';
  const videoId = realYouTube ? 'jNQXAC9IVRw' : 'dQw4w9WgXcQ';
  const suffix = realYouTube ? '-real' : '';
  page.on('request', request => { if (request.url().endsWith('/api/youtube/editor-source')) sourceRequests++; });
  await page.route('**/api/customer/me', route => route.fulfill({json:{user:{id:'editor-smoke',name:'Smoke Test'}}}));
  await page.route('**/__editor_smoke_source.mp4', route => route.fulfill({contentType:'video/mp4',body:fs.readFileSync(fixture)}));
  if (!realYouTube) await page.route('**/api/youtube/editor-source', route => {
    assert.equal(route.request().postDataJSON().videoId,videoId);
    return route.fulfill({json:{previewUrl:'/__editor_smoke_source.mp4'}});
  });
  async function drag(selector, dx, dy) {
    const box = await page.locator(selector).boundingBox();
    assert(box, `Missing ${selector}`);
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*.5+dx,box.y+box.height*.5+dy,{steps:10});
    await page.mouse.up();
  }
  const regions = () => page.evaluate(() => structuredClone(dualCropRegions));
  try {
    await page.goto(base+'/index.html');
    await page.locator('#ytUrlInput').fill('https://www.youtube.com/watch?v='+videoId);
    await page.locator('#smartClipBtn').click();
    await page.locator('#clipEditorDialog').waitFor({state:'visible'});
    await page.waitForFunction(() => document.querySelector('[data-live-region="main"] video').readyState >= 2);
    assert(sourceRequests>0,'YouTube flow must call the source preparation endpoint');
    await page.locator('[data-crop-select="inset"]').click();
    const before = await regions();
    await drag('[data-live-region="inset"]',-35,-30);
    const placed = await regions();
    assert.notDeepEqual(placed.inset.placement,before.inset.placement);
    assert.equal(placed.inset.x,before.inset.x);
    assert.equal(placed.inset.y,before.inset.y);
    await drag('#dualCropOverlay [data-crop="inset"]',-25,-20);
    const cropped = await regions();
    assert.notEqual(cropped.inset.x,placed.inset.x);
    assert.deepEqual(cropped.inset.placement,placed.inset.placement);
    await page.locator('#dualViewEnabled').uncheck();
    await page.locator('[data-live-region="inset"]').waitFor({state:'hidden'});
    await page.locator('#dualViewEnabled').check();
    await page.waitForFunction(() => !document.querySelector('#heroMediaVideo').hidden && document.querySelector('#heroMediaVideo').readyState >= 2);
    // Allow the debounced metadata request to settle, then verify it cannot clear source playback.
    await page.waitForTimeout(1500);
    assert(await page.locator('#heroMediaVideo').evaluate(video => !video.hidden && video.readyState >= 2));
    const bounds = await page.locator('#clipEditorDialog').boundingBox();
    assert(Math.abs(bounds.width-1365*.9)<2 && Math.abs(bounds.height-768*.9)<2);
    assert(bounds.x>=0 && bounds.y>=0);
    const layout = await page.locator('.clip-editor-layout').boundingBox();
    const left = await page.locator('.clip-editor-left-rail').boundingBox();
    const right = await page.locator('.clip-editor-source-column').boundingBox();
    assert(Math.abs(left.width/(left.width+right.width)-.25)<.01,'Preview columns must be 25/75');
    assert(Math.abs(right.height-layout.height)<2,'Source column must fill the body row');
    await page.locator('#heroMediaVideo').evaluate(video => {video.pause();video.currentTime=1.5;});
    await page.waitForFunction(() => {
      const source=document.querySelector('#heroMediaVideo');
      return [...document.querySelectorAll('#editorLiveComposition video')].filter(video=>!video.parentElement.hidden)
        .every(video=>video.paused && Math.abs(video.currentTime-source.currentTime)<=.25);
    });
    await page.screenshot({path:`scratch/editor-layout-youtube${suffix}.png`});
    await page.keyboard.press('Escape');
    await page.locator('#clipEditorDialog').waitFor({state:'hidden'});
    await page.locator('#ytUrlInput').fill('');
    await page.locator('#videoInput').setInputFiles(fixture);
    await page.waitForFunction(() => window.state?.uploadedProject?.source === 'upload',null,{timeout:120000});
    await page.locator('#smartClipBtn').click();
    await page.locator('#clipEditorDialog').waitFor({state:'visible'});
    await page.waitForFunction(() => document.querySelector('[data-live-region="main"] video').readyState >= 2);
    await page.screenshot({path:`scratch/editor-layout-upload${suffix}.png`});
    assert.deepEqual(errors,[],'Browser runtime errors');
    console.log(`PASS: ${realYouTube ? 'real YouTube endpoint' : 'YouTube endpoint fixture'}, uploaded video, live frames, independent drags, checkbox, Escape, and 90vw/90vh layout`);
  } finally { await browser.close(); }
}
main().catch(error => {console.error(error);process.exitCode=1;});
