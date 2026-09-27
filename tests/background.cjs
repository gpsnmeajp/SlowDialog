// Run with Node.js and Playwright installed; uses the installed Edge browser.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const entry of ['index.html', 'index_en.html', 'dist/index.html', 'dist/index_en.html']) {
            const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('dialog', dialog => dialog.dismiss());
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
            await page.locator('#btn-intro-next').click();
            await page.locator('#setting-apikey').fill('test-key');
            await page.locator('#settings-tab-display').click();
            assert.equal(await page.locator('#setting-background-x').inputValue(), 'center');
            assert.equal(await page.locator('#setting-background-y').inputValue(), 'center');
            const image = (width, height) => ({
                name: 'test.svg', mimeType: 'image/svg+xml',
                buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="red"/></svg>`),
            });
            await page.locator('#setting-background-file').setInputFiles(image(8192, 2048));
            await page.waitForFunction(() => document.querySelector('#background-status').textContent === '4096 × 1024 px');
            await page.locator('#setting-background-x').selectOption('right');
            await page.locator('#setting-background-y').selectOption('bottom');
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
            await page.reload();
            await page.waitForFunction(() => document.querySelector('#background-image').style.backgroundImage.includes('blob:'));
            assert.deepEqual(await page.locator('#background-image').evaluate(el => [el.style.opacity, el.style.backgroundPosition, getComputedStyle(el).backgroundSize]), ['0.65', 'right bottom', 'cover']);
            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-display').click();
            await page.locator('#btn-remove-background').click();
            assert.equal(await page.locator('#background-image').evaluate(el => el.style.backgroundImage), 'none');
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
            await page.locator('#setting-background-transparency').fill('100');
            assert.equal(await page.locator('#background-image').evaluate(el => el.style.opacity), '0');
            await page.locator('#setting-background-transparency').fill('0');
            assert.equal(await page.locator('#background-image').evaluate(el => el.style.opacity), '1');
            await page.locator('#btn-save-settings').click();
            await page.waitForFunction(() => document.querySelector('#settings-overlay').classList.contains('hidden'));
            assert.deepEqual((await checkSaved()).size, [512, 4096]);
            if (process.env.BACKGROUND_SCREENSHOT && entry === 'index.html') {
                await page.screenshot({ path: process.env.BACKGROUND_SCREENSHOT });
            }
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
            console.log(`PASS ${entry}: resizing, persistence, positioning, transparency, cancel, invalid image, deletion`);
            await context.close();
        }
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
