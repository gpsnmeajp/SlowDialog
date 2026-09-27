// Run with Node.js and Playwright installed; uses the installed Edge browser.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// Only numeric positions are retained; old alignment names and invalid values are discarded.
const settingsSource = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8').split('const BackgroundImage =')[0];
for (const [x, y, expectedX, expectedY] of [
    ['left', 'top', 0.5, 0.5], ['center', 'center', 0.5, 0.5], ['right', 'bottom', 0.5, 0.5],
    [0.23, 0.87, 0.23, 0.87], [-2, 4, 0, 1], [null, 'invalid', 0.5, 0.5],
]) {
    let stored = { backgroundPositionX: x, backgroundPositionY: y };
    const context = vm.createContext({ document: { documentElement: { lang: 'ja' } }, localStorage: {
        getItem: () => JSON.stringify(stored), setItem: (_, value) => { stored = JSON.parse(value); },
    } });
    vm.runInContext(settingsSource, context);
    const settings = vm.runInContext('Settings', context);
    assert.equal(settings.load().backgroundPositionX, expectedX);
    assert.equal(settings.get().backgroundPositionY, expectedY);
    settings.save({ backgroundPositionX: x, backgroundPositionY: y });
    assert.equal(stored.backgroundPositionX, expectedX);
    assert.equal(stored.backgroundPositionY, expectedY);
}

const closeTo = (actual, expected, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
async function cropState(page) {
    await page.locator('#background-crop-box').waitFor({ state: 'visible' });
    return page.evaluate(() => {
        const rect = id => {
            const { x, y, width, height } = document.getElementById(id).getBoundingClientRect();
            return { x, y, width, height };
        };
        const layer = document.getElementById('background-image');
        return { area: rect('background-crop-area'), box: rect('background-crop-box'), layer: rect('background-image'),
            x: parseFloat(layer.style.backgroundPositionX) / 100, y: parseFloat(layer.style.backgroundPositionY) / 100 };
    });
}

async function moveCrop(page, x, y, touch = false) {
    await page.locator('#background-crop-box').scrollIntoViewIfNeeded();
    const before = await cropState(page);
    const start = { x: before.box.x + before.box.width / 2, y: before.box.y + before.box.height / 2 };
    const end = { x: start.x + (x - before.x) * (before.area.width - before.box.width),
        y: start.y + (y - before.y) * (before.area.height - before.box.height) };
    if (touch) {
        const session = await page.context().newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [end] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await session.detach();
    } else {
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(end.x, end.y, { steps: 5 });
        await page.mouse.up();
    }
    const after = await cropState(page);
    closeTo(after.x, Math.max(0, Math.min(1, x)));
    closeTo(after.y, Math.max(0, Math.min(1, y)));
    closeTo(after.box.width / after.box.height, after.layer.width / after.layer.height);
    assert.ok(after.box.x >= after.area.x - 0.1 && after.box.y >= after.area.y - 0.1);
    assert.ok(after.box.x + after.box.width <= after.area.x + after.area.width + 0.1);
    assert.ok(after.box.y + after.box.height <= after.area.y + after.area.height + 0.1);
    return after;
}

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const entry of ['index.html', 'index_en.html', 'dist/index.html', 'dist/index_en.html']) {
            const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('dialog', dialog => dialog.dismiss());
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
            await page.locator('#btn-intro-next').click();
            await page.locator('#setting-apikey').fill('test-key');
            await page.locator('#settings-tab-display').click();
            assert.equal(await page.locator('#setting-background-x, #setting-background-y').count(), 0);
            assert.equal(await page.locator('#background-crop-box').isVisible(), false);
            const image = (width, height) => ({
                name: 'test.svg', mimeType: 'image/svg+xml',
                buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="g"><stop stop-color="#345"/><stop offset="1" stop-color="#f90"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`),
            });
            await page.locator('#setting-background-file').setInputFiles(image(8192, 2048));
            await page.waitForFunction(() => document.querySelector('#background-status').textContent === '4096 × 1024 px');
            const centered = await cropState(page);
            closeTo(centered.x, 0.5);
            closeTo(centered.y, 0.5);
            closeTo(centered.area.width / centered.area.height, 4);
            await moveCrop(page, -1, 0.5);
            await moveCrop(page, 2, 0.5);
            await moveCrop(page, 0.73, 0.5);
            await page.locator('#background-crop-box').press('ArrowLeft');
            closeTo((await cropState(page)).x, 0.72);
            await page.locator('#background-crop-box').press('Shift+ArrowRight');
            closeTo((await cropState(page)).x, 0.82);
            const selected = await moveCrop(page, 0.73, 0.5);
            if (process.env.BACKGROUND_SCREENSHOT && entry === 'index.html') {
                await page.screenshot({ path: process.env.BACKGROUND_SCREENSHOT });
            }
            // ドラッグ中はラベルのみ更新、リリース時に画像を再読み込みせず不透明度だけ適用
            // Dragging updates the label only; releasing applies opacity without reloading the image.
            const slider = page.locator('#setting-background-transparency');
            await slider.scrollIntoViewIfNeeded();
            const bounds = await slider.boundingBox();
            const originalImage = await page.locator('#background-image').evaluate(el => el.style.backgroundImage);
            await page.mouse.move(bounds.x + 8, bounds.y + bounds.height / 2);
            await page.mouse.down();
            await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height / 2, { steps: 5 });
            const transparency = Number(await slider.inputValue());
            assert.ok(transparency > 0);
            assert.equal(await page.locator('#background-transparency-value').textContent(), `${transparency}%`);
            for (const target of ['#background-image', '#background-preview']) {
                assert.equal(await page.locator(target).evaluate(el => el.style.opacity), '1');
            }
            await page.mouse.up();
            for (const target of ['#background-image', '#background-preview']) {
                assert.ok(Math.abs(Number(await page.locator(target).evaluate(el => el.style.opacity)) - (1 - transparency / 100)) < 0.00001);
                assert.equal(await page.locator(target).evaluate(el => el.style.backgroundImage), originalImage);
            }
            await page.locator('#setting-background-transparency').fill('35');
            await page.locator('#btn-save-settings').click();
            await page.waitForFunction(() => document.querySelector('#settings-overlay').classList.contains('hidden'));
            const checkSaved = async () => page.evaluate(async () => {
                const settings = JSON.parse(localStorage.getItem('slowdialog_settings'));
                const database = await new Promise(resolve => {
                    const request = indexedDB.open('slowdialog_backgrounds', 1);
                    request.onsuccess = () => resolve(request.result);
                });
                const blob = await new Promise(resolve => {
                    const request = database.transaction('images').objectStore('images').get(settings.backgroundImageId);
                    request.onsuccess = () => resolve(request.result);
                });
                database.close();
                const bitmap = await createImageBitmap(blob);
                const size = [bitmap.width, bitmap.height];
                bitmap.close();
                return { size, settings };
            });
            const stored = await checkSaved();
            assert.deepEqual(stored.size, [4096, 1024]);
            assert.equal(stored.settings.backgroundTransparency, 35);
            closeTo(stored.settings.backgroundPositionX, selected.x, 0.00001);
            assert.equal(stored.settings.backgroundPositionY, 0.5);
            await page.reload();
            await page.waitForFunction(() => document.querySelector('#background-image').style.backgroundImage.includes('blob:'));
            assert.deepEqual(await page.locator('#background-image').evaluate(el => [el.style.opacity, getComputedStyle(el).backgroundSize]), ['0.65', 'cover']);
            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-display').click();
            closeTo((await cropState(page)).x, selected.x);
            assert.equal(await page.locator('#setting-background-transparency').inputValue(), '35');
            await page.setViewportSize({ width: 1280, height: 720 });
            await page.waitForFunction(() => {
                const box = document.querySelector('#background-crop-box').getBoundingClientRect();
                return Math.abs(box.width / box.height - 800 / 720) < 0.01;
            });
            closeTo((await cropState(page)).x, selected.x);
            await page.setViewportSize({ width: 390, height: 844 });
            await moveCrop(page, 0.2, 0.5);
            await page.locator('#btn-cancel-settings').click();
            closeTo(await page.locator('#background-image').evaluate(el => parseFloat(el.style.backgroundPositionX) / 100), selected.x);
            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-display').click();
            closeTo((await cropState(page)).x, selected.x);
            await page.locator('#btn-remove-background').click();
            assert.equal(await page.locator('#background-image').evaluate(el => el.style.backgroundImage), 'none');
            assert.equal(await page.locator('#background-crop-box').isVisible(), false);
            await page.locator('#btn-cancel-settings').click();
            assert.match(await page.locator('#background-image').evaluate(el => el.style.backgroundImage), /blob:/);
            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-display').click();
            // 保存失敗時は直前の画像・設定を維持する
            // A storage failure must preserve the previously saved image/settings.
            await page.locator('#setting-background-file').setInputFiles(image(320, 240));
            await page.waitForFunction(() => document.querySelector('#background-status').textContent === '320 × 240 px');
            await page.evaluate(() => {
                window.originalStorageSetItem = Storage.prototype.setItem;
                Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
            });
            const failedSave = page.waitForEvent('dialog');
            await page.locator('#btn-save-settings').click();
            await failedSave;
            await page.waitForFunction(() => !document.querySelector('#btn-save-settings').disabled);
            assert.equal(await page.locator('#settings-overlay').evaluate(el => el.classList.contains('hidden')), false);
            assert.deepEqual((await checkSaved()).size, [4096, 1024]);
            await page.evaluate(() => { Storage.prototype.setItem = window.originalStorageSetItem; });
            await page.locator('#setting-background-file').setInputFiles(image(1024, 8192));
            await page.waitForFunction(() => document.querySelector('#background-status').textContent === '512 × 4096 px');
            const tall = await moveCrop(page, selected.x, 0.27, true);
            closeTo(tall.area.width / tall.area.height, 1 / 8);
            await moveCrop(page, selected.x, -1);
            await moveCrop(page, selected.x, 2);
            await moveCrop(page, selected.x, 0.27);
            await page.locator('#setting-background-transparency').fill('100');
            assert.equal(await page.locator('#background-image').evaluate(el => el.style.opacity), '0');
            await page.locator('#setting-background-transparency').fill('0');
            assert.equal(await page.locator('#background-image').evaluate(el => el.style.opacity), '1');
            await page.locator('#btn-save-settings').click();
            await page.waitForFunction(() => document.querySelector('#settings-overlay').classList.contains('hidden'));
            assert.deepEqual((await checkSaved()).size, [512, 4096]);
            closeTo((await checkSaved()).settings.backgroundPositionY, 0.27);
            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-display').click();
            // An exact aspect-ratio match has no travel and must never produce NaN.
            await page.locator('#setting-background-file').setInputFiles(image(780, 1688));
            await page.waitForFunction(() => document.querySelector('#background-status').textContent === '780 × 1688 px');
            const matched = await cropState(page);
            closeTo(matched.box.width, matched.area.width, 0.1);
            closeTo(matched.box.height, matched.area.height, 0.1);
            await page.locator('#background-crop-box').press('ArrowRight');
            await page.locator('#background-crop-box').press('ArrowDown');
            closeTo((await cropState(page)).x, selected.x);
            closeTo((await cropState(page)).y, 0.27);
            await page.locator('#btn-cancel-settings').click();
            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-display').click();
            await page.locator('#setting-background-file').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
            await page.waitForFunction(() => /Could not read|画像を読み込めません/.test(document.querySelector('#background-status').textContent));
            assert.match(await page.locator('#background-image').evaluate(el => el.style.backgroundImage), /blob:/);
            await page.locator('#btn-remove-background').click();
            await page.locator('#btn-save-settings').click();
            await page.waitForFunction(() => document.querySelector('#settings-overlay').classList.contains('hidden'));
            await page.reload();
            assert.equal(await page.locator('#background-image').evaluate(el => el.style.backgroundImage), 'none');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('slowdialog_settings')).backgroundImageId), null);
            assert.deepEqual(errors, []);
            console.log(`PASS ${entry}: normalized crop, mouse/touch/keyboard, bounds, viewport resize, persistence, transparency, cancel, invalid image, deletion`);
            await context.close();
        }
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
