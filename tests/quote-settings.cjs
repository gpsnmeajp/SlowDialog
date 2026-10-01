// Run with Node.js + Playwright and installed Edge. Chat and speech APIs are mocked.
const { chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const reply = '「最初。後（補足。続き）です。」と話す。『一文。二文。』と書く。';
const together = ['「最初。後（補足。続き）です。」と話す。', '『一文。二文。』と書く。'];
const separated = ['「最初。', '後（補足。続き）です。」', 'と話す。', '『一文。', '二文。』', 'と書く。'];
const wav = fs.readFileSync(path.resolve(__dirname, '../sound/assistant.wav'));

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const entry of ['index.html', 'index_en.html', 'dist/index.html', 'dist/index_en.html']) {
            const english = entry.includes('_en');
            const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
            const page = await context.newPage();
            const errors = [], speech = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(english => {
                localStorage.setItem('slowdialog_intro_seen', '1');
                if (!localStorage.getItem('slowdialog_settings')) localStorage.setItem('slowdialog_settings', JSON.stringify({
                    apiKey: 'test', baseUrl: 'https://chat.test/v1', soundEnabled: false,
                    voicevoxEnabled: !english, voicevoxUrl: 'https://speech.test',
                    irodoriEnabled: english, irodoriUrl: 'https://speech.test',
                    charDelayMs: 1, minDelaySec: 0,
                    // Existing saved settings deliberately have no splitInsideQuotes key.
                }));
                window.Audio = class extends EventTarget {
                    play() {
                        setTimeout(() => this.dispatchEvent(new Event('ended')), 0);
                        return Promise.resolve();
                    }
                };
            }, english);
            await page.route('https://chat.test/**', route => route.fulfill({ contentType: 'text/event-stream',
                body: 'data: ' + JSON.stringify({ choices: [{ delta: { content: reply } }] }) + '\n\ndata: [DONE]\n\n' }));
            await page.route('https://speech.test/**', route => {
                const url = new URL(route.request().url());
                if (url.pathname === '/audio_query') {
                    speech.push(url.searchParams.get('text'));
                    return route.fulfill({ contentType: 'application/json', body: '{}' });
                }
                if (url.pathname === '/v1/audio/speech') speech.push(route.request().postDataJSON().input);
                return route.fulfill({ contentType: 'audio/wav', body: wav });
            });
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
            const checkbox = page.getByRole('checkbox', { name: english ? 'Split inside Japanese quotation marks' : 'かぎ括弧内を分割する', exact: true });
            const bubbles = page.locator('.msg.assistant');
            const open = async () => {
                await page.locator('#btn-settings').click();
                await page.locator('#settings-tab-conversation').click();
            };
            const save = async () => {
                await page.locator('#btn-save-settings').click();
                await expect(page.locator('#settings-overlay')).toBeHidden();
            };
            const send = async turn => {
                await page.locator('#user-input').fill('返答 ' + turn);
                await page.locator('#btn-send').click();
                await expect(page.locator('.msg-timestamp.assistant')).toHaveCount(turn);
            };

            await open();
            await expect(checkbox).not.toBeChecked();
            assert.equal(await page.evaluate(() => Settings.get().splitInsideQuotes), false);
            await checkbox.check();
            await page.locator('#btn-cancel-settings').click();
            await open();
            await expect(checkbox).not.toBeChecked();
            await page.locator('#btn-cancel-settings').click();

            await send(1);
            await expect(bubbles).toHaveText(together);
            assert.deepEqual(speech, ['「最初。後です。」と話す。', '『一文。二文。』と書く。']);

            await open();
            await checkbox.check();
            await save();
            await expect(bubbles).toHaveText(separated);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('slowdialog_settings')).splitInsideQuotes), true);
            assert.equal(speech.length, 2, 'history reflow does not synthesize speech');
            await page.reload();
            await expect(bubbles).toHaveText(separated);
            await open();
            await expect(checkbox).toBeChecked();
            await page.locator('#btn-cancel-settings').click();

            await send(2);
            await expect(bubbles).toHaveText([...separated, ...separated]);
            assert.deepEqual(speech.slice(2), ['「最初。', '後です。」', 'と話す。', '『一文。', '二文。』', 'と書く。']);

            await open();
            await checkbox.uncheck();
            await save();
            await expect(bubbles).toHaveText([...together, ...together]);
            await page.reload();
            await expect(bubbles).toHaveText([...together, ...together]);
            await open();
            await expect(checkbox).not.toBeChecked();
            assert.equal(speech.length, 8, 'settings and reload do not resynthesize history');
            assert.deepEqual(errors, []);
            console.log(`PASS ${entry}: quote default, cancel, persistence, history, ${english ? 'Irodori' : 'VOICEVOX'}`);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
