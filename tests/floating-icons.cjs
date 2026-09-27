// Run with Node.js and Playwright installed; uses the installed Edge browser.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

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
            await page.locator('#btn-cancel-settings').click();
            const image = (name, color, width = 200, height = 200) => ({ name, mimeType: 'image/svg+xml', buffer: Buffer.from(
                `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><circle cx="100" cy="100" r="90" fill="${color}"/></svg>`),
            });
            const records = (includeDimensions = false) => page.evaluate(async includeDimensions => {
                const db = await new Promise(resolve => {
                    const request = indexedDB.open('slowdialog_floating_icons', 1);
                    request.onsuccess = () => resolve(request.result);
                });
                const records = await new Promise(resolve => {
                    const request = db.transaction('icons').objectStore('icons').getAll();
                    request.onsuccess = () => resolve(request.result);
                });
                db.close();
                return Promise.all(records.map(async ({ blob, ...record }) => {
                    if (includeDimensions) {
                        const bitmap = await createImageBitmap(blob);
                        record.dimensions = [bitmap.width, bitmap.height];
                        bitmap.close();
                    }
                    return record;
                }));
            }, includeDimensions);
            const waitStored = async predicate => {
                for (let attempt = 0; attempt < 100; attempt++) {
                    const result = await records();
                    if (predicate(result)) return result;
                    await page.waitForTimeout(30);
                }
                assert.fail('Icon state was not saved');
            };
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#btn-add-floating-icon').click()]);
            await chooser.setFiles(image('red.svg', 'red'));
            const icon = page.locator('.floating-icon').first();
            await icon.waitFor();
            let rect = await icon.boundingBox();
            const screen = await page.locator('#floating-icons').boundingBox();
            assert.ok(Math.abs(rect.width - screen.width / 4) < 1);
            assert.ok(Math.abs(rect.x + rect.width - screen.x - screen.width) < 1);
            assert.ok(Math.abs(rect.y - screen.y) < 1);
            assert.equal(await icon.evaluate(el => getComputedStyle(el).borderWidth), '0px');
            await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
            await page.mouse.down();
            await page.mouse.move(130, 300, { steps: 8 });
            await page.mouse.up();
            const [moved] = await waitStored(r => r[0]?.x < 0.9 && r[0]?.y > 0.1);
            assert.ok(moved.x >= 0 && moved.y <= 1);
            await icon.click({ button: 'right' });
            await page.locator('#floating-icon-size').fill('40');
            await waitStored(r => r[0]?.size === 0.4);
            await page.evaluate(() => {
                window.originalIconPut = IDBObjectStore.prototype.put;
                IDBObjectStore.prototype.put = () => { throw new DOMException('Full', 'QuotaExceededError'); };
            });
            const saveFailure = page.waitForEvent('dialog');
            await page.locator('#floating-icon-lock').click();
            await saveFailure;
            assert.equal((await records())[0].locked, false);
            assert.equal(await icon.getAttribute('data-locked'), 'false');
            await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalIconPut; });
            await page.locator('#floating-icon-lock').click();
            await waitStored(r => r[0]?.locked === true);
            await page.locator('#floating-icon-close').click();
            rect = await icon.boundingBox();
            await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
            await page.mouse.down();
            await page.mouse.move(250, 500, { steps: 5 });
            await page.mouse.up();
            assert.deepEqual(await icon.boundingBox(), rect);
            await icon.click({ button: 'right' });
            await page.locator('#floating-icon-lock').click();
            await waitStored(r => r[0]?.locked === false);
            await page.locator('#floating-icon-close').click();
            // Real touch long-press and two-finger pinch through Chromium's input system.
            const cdp = await context.newCDPSession(page);
            rect = await icon.boundingBox();
            const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
            await page.locator('#floating-icon-menu').waitFor({ state: 'visible' });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            await page.locator('#floating-icon-close').click();
            const points = distance => [{ x: center.x - distance, y: center.y, id: 1 }, { x: center.x + distance, y: center.y, id: 2 }];
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(20) });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(30) });
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
            const [pinched] = await waitStored(r => r[0]?.size > 0.5);
            assert.ok(Math.abs(pinched.size - 0.6) < 0.03);
            await page.setViewportSize({ width: 1000, height: 700 });
            await page.waitForTimeout(100);
            const resized = await icon.boundingBox();
            const resizedScreen = await page.locator('#floating-icons').boundingBox();
            assert.ok(Math.abs(resized.width - Math.min(resizedScreen.width, resizedScreen.height) * pinched.size) < 1);
            assert.ok(Math.abs((resized.x - resizedScreen.x) / (resizedScreen.width - resized.width) - pinched.x) < 0.01);
            assert.ok(Math.abs((resized.y - resizedScreen.y) / (resizedScreen.height - resized.height) - pinched.y) < 0.01);
            await page.reload();
            await page.locator('#btn-cancel-settings').click();
            await icon.waitFor();
            const restored = await icon.boundingBox();
            assert.ok(Math.abs(restored.x - resized.x) < 1 && Math.abs(restored.width - resized.width) < 1);
            // Multiple icons and invalid input do not replace the existing image.
            await page.locator('#floating-icon-file').setInputFiles(image('blue.svg', 'blue'));
            await waitStored(r => r.length === 2);
            await page.waitForFunction(() => document.querySelectorAll('.floating-icon').length === 2);
            await page.locator('#floating-icon-file').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('bad') });
            await page.waitForFunction(() => !document.querySelector('#btn-add-floating-icon').disabled);
            assert.equal(await page.locator('.floating-icon').count(), 2);
            if (process.env.FLOATING_SCREENSHOT && entry === 'index.html') await page.screenshot({ path: process.env.FLOATING_SCREENSHOT });
            await icon.focus();
            await page.keyboard.press('Shift+F10');
            await page.locator('#floating-icon-delete').click();
            await waitStored(r => r.length === 1);
            await page.reload();
            await page.waitForFunction(() => document.querySelectorAll('.floating-icon').length === 1);
            await page.locator('#btn-cancel-settings').click();
            // Verify the persisted image Blobs, not just the CSS display size.
            await page.locator('#floating-icon-file').setInputFiles([
                image('wide.svg', 'green', 8192, 2048),
                image('tall.svg', 'purple', 2048, 8192),
            ]);
            await waitStored(r => r.length === 3);
            const checkDimensions = async () => {
                const stored = await records(true);
                assert.deepEqual(stored.find(r => r.ratio === 4).dimensions, [4096, 1024]);
                assert.deepEqual(stored.find(r => r.ratio === 0.25).dimensions, [1024, 4096]);
                assert.deepEqual(stored.find(r => r.ratio === 1).dimensions, [200, 200]);
            };
            await checkDimensions();
            await page.reload();
            await page.waitForFunction(() => document.querySelectorAll('.floating-icon').length === 3);
            await checkDimensions();
            assert.deepEqual(errors, []);
            console.log(`PASS ${entry}: add, drag, menu resize, lock, long-press, pinch, responsive placement, reload, multiple images, delete, 4096px image limit`);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
