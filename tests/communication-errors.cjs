// Run with Node.js + Playwright and installed Edge. No live API connections.
const { chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const entry of ['index.html', 'index_en.html', 'dist/index.html', 'dist/index_en.html']) {
            const ja = !entry.includes('_en');
            const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => {
                localStorage.setItem('slowdialog_intro_seen', '1');
                localStorage.setItem('slowdialog_settings', JSON.stringify({
                    apiKey: 'test', baseUrl: 'https://errors.test/v1', soundEnabled: false,
                    intentBaseUrl: 'https://errors.test', intentDelay: 0, intentChoices: '質問\n感謝',
                    voicevoxUrl: 'https://errors.test',
                }));
                const fetchOriginal = window.fetch.bind(window);
                window.fetch = (url, options) => {
                    if (String(url).startsWith('https://errors.test/') && window.failureMessage) {
                        return Promise.reject(new Error(window.failureMessage));
                    }
                    return fetchOriginal(url, options);
                };
            });
            let status = 429, networkFailure = false, synthesisFailure = false;
            await page.route('https://errors.test/**', async route => {
                if (networkFailure) return route.abort('failed');
                if (synthesisFailure && new URL(route.request().url()).pathname === '/audio_query') {
                    return route.fulfill({ contentType: 'application/json', body: '{}' });
                }
                await route.fulfill({ status, contentType: 'application/json', body: '{}' });
            });
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
            const input = page.locator('#user-input');
            const retry = page.locator('#retry-bar');
            const retryText = ja ? '通信に失敗しました' : 'Communication failed';
            await input.fill('Chat failure');
            await page.locator('#btn-send').click();
            await expect(retry).toBeVisible();
            await expect(retry.locator('span')).toHaveText(retryText + '(429)');
            networkFailure = true;
            await page.locator('#btn-retry').click();
            await expect(retry.locator('span')).toHaveText(retryText + '(Failed t)');
            // Repeated errors must replace the previous detail, and count Unicode code points.
            networkFailure = false;
            await page.evaluate(() => { window.failureMessage = '😀通信に失敗しました'; });
            await page.locator('#btn-retry').click();
            await expect(retry.locator('span')).toHaveText(retryText + '(😀通信に失敗しま)');
            await page.evaluate(() => { window.failureMessage = ''; Settings.save({ ...Settings.get(), intentEnabled: true }); });

            const badge = page.locator('#intent-badge');
            const errorText = ja ? '通信異常' : 'Connection error';
            await input.fill('Intent failure');
            await expect(badge).toHaveText(errorText + '(429)');
            await page.locator('#btn-send').click();
            await expect(page.locator('#intent-confirm-message')).toContainText(ja ? '通信異常(429)' : 'connection error(429)');
            await page.locator('#btn-intent-confirm-cancel').click();
            // The edit/quick-response controller keeps its own cause.
            status = 503;
            await page.locator('.quick-response-btn').first().click();
            const editBadge = page.locator('#edit-intent-badge');
            await expect(editBadge).toHaveText(errorText + '(503)');
            await page.locator('#btn-bubble-edit-send').click();
            await expect(page.locator('#intent-confirm-message')).toContainText(ja ? '通信異常(503)' : 'connection error(503)');
            await page.locator('#btn-intent-confirm-cancel').click();
            await page.locator('#btn-bubble-edit-cancel').click();
            await expect(badge).toHaveText(errorText + '(429)');
            networkFailure = true;
            await input.fill('Intent network failure');
            await expect(badge).toHaveText(errorText + '(Failed t)');
            networkFailure = false;
            await page.evaluate(() => { window.failureMessage = '<b>123456789'; });
            await input.fill('Literal error detail');
            await expect(badge).toHaveText(errorText + '(<b>12345)');
            assert.equal(await badge.locator('b').count(), 0);
            await input.fill('');
            await expect(badge).toBeHidden();
            await page.evaluate(() => { window.failureMessage = ''; });

            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-speech').click();
            await page.locator('#setting-voicevox-enabled').check();
            const voiceStatus = page.locator('#voicevox-status');
            const voiceCases = [
                ['#btn-voicevox-test', ja ? '接続に失敗しました。' : 'Connection failed.'],
                ['#btn-voicevox-load-speakers', ja ? '話者リストの取得に失敗しました。' : 'Failed to load speakers.'],
                ['#btn-voicevox-speak-test', ja ? '発話テストに失敗しました。' : 'Test speech failed.'],
            ];
            for (const [button, label] of voiceCases) {
                status = 429;
                await page.locator(button).click();
                await expect(voiceStatus).toHaveText(label + '(429)');
                networkFailure = true;
                await page.locator(button).click();
                await expect(voiceStatus).toHaveText(label + '(Failed t)');
                networkFailure = false;
            }
            // Speech can fail in its second request, after audio_query succeeds.
            synthesisFailure = true;
            status = 502;
            await page.locator('#btn-voicevox-speak-test').click();
            await expect(voiceStatus).toHaveText(voiceCases[2][1] + '(502)');
            assert.deepEqual(errors, [], entry);
            console.log('PASS', entry, 'communication error details');
            await context.close();
        }
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
