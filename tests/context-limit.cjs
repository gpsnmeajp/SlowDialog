// Context-limit reminder lifecycle and send-path regressions; no live API calls.
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
            const errors = [], requests = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => {
                localStorage.setItem('slowdialog_intro_seen', '1');
                if (!localStorage.getItem('slowdialog_settings')) {
                    localStorage.setItem('slowdialog_settings', JSON.stringify({
                        apiKey: 'test', baseUrl: 'https://context.test/v1', contextSize: 4,
                        charDelayMs: 0, minDelaySec: 0, soundEnabled: false,
                        intentBaseUrl: 'https://context.test', intentDelay: 0, intentChoices: '質問\n感謝',
                    }));
                    localStorage.setItem('slowdialog_history', JSON.stringify([
                        { role: 'user', content: 'Old question' }, { role: 'assistant', content: 'Old answer' },
                    ]));
                }
            });
            await page.route('**/chat/completions', async route => {
                requests.push(route.request().postDataJSON());
                await route.fulfill({ contentType: 'text/event-stream',
                    body: 'data: {"choices":[{"delta":{"content":"OK."}}]}\n\ndata: [DONE]\n\n' });
            });
            await page.route('**/systemone', route => route.fulfill({ contentType: 'application/json',
                body: JSON.stringify({ answers: { intent: { type: 'choice', choice: '質問', confidence: 1,
                    probabilities: { '質問': 1, '感謝': 0 } } } }),
            }));
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
            const input = page.locator('#user-input');
            const dialog = page.locator('#context-limit-confirm');
            const send = page.locator('#btn-send');
            const cancel = page.locator('#btn-context-limit-confirm-cancel');
            const proceed = page.locator('#btn-context-limit-confirm-send');
            const history = () => page.evaluate(() => ChatHistory.getAll());
            const finished = async count => {
                await expect.poll(() => requests.length).toBe(count);
                await page.waitForFunction(() => ChatHistory.peekLast()?.content === 'OK.'
                    && !document.querySelector('.typing-indicator, .pause-btn'));
            };
            const sendWithoutReminder = async text => {
                const count = requests.length;
                await input.fill(text);
                await send.click();
                await finished(count + 1);
                await expect(dialog).not.toBeVisible();
            };
            const approveReminder = async () => {
                const count = requests.length;
                await expect(dialog).toBeVisible();
                await proceed.click();
                await finished(count + 1);
            };
            const sendWithReminder = async text => {
                const before = await history();
                const count = requests.length;
                await input.fill(text);
                await send.click();
                await expect(dialog).toBeVisible();
                assert.deepEqual(await history(), before);
                assert.equal(requests.length, count);
                await approveReminder();
            };
            const importHistory = async (count = 4) => {
                await page.locator('#btn-import').click();
                await page.locator('#import-json').fill(JSON.stringify(Array.from({ length: count }, (_, i) => ({
                    role: i % 2 ? 'assistant' : 'user', content: `Loaded ${i}`,
                }))));
                await page.locator('#btn-import-exec').click();
                await expect(page.locator('#import-overlay')).not.toBeVisible();
            };
            const saveLimit = async limit => {
                await page.locator('#btn-settings').click();
                await page.locator('#settings-tab-conversation').click();
                await page.locator('#setting-contextsize').fill(String(limit));
                await page.locator('#btn-save-settings').click();
                await expect(page.locator('#settings-overlay')).not.toBeVisible();
            };
            const cancelReminder = async () => {
                await expect(dialog).toBeVisible();
                await cancel.click();
                await expect(dialog).not.toBeVisible();
            };

            // Reaching the limit does not interrupt a turn. The following send prompts.
            await sendWithoutReminder('Reach the limit');
            assert.equal((await history()).length, 4);
            await input.fill('   ');
            await send.click();
            await expect(dialog).not.toBeVisible();
            const before = await history();
            await input.fill('Keep this draft');
            await input.press('Enter');
            await expect(dialog).toBeVisible();
            await expect(cancel).toBeFocused();
            await expect(page.locator('#context-limit-confirm-message')).toHaveText(ja
                ? 'コンテキスト上限に到達しました。このままメッセージを送信すると、古いメッセージから削除されます。上限は設定画面から変更できます。送信を続けますか？'
                : 'The context limit has been reached. If you send this message, the oldest messages will be deleted first. You can change the limit in Settings. Continue sending?');
            // Even programmatic repeat clicks cannot bypass the pending dialog.
            await page.evaluate(() => {
                document.getElementById('btn-send').click();
                document.getElementById('btn-send').click();
            });
            assert.equal(requests.length, 1);
            assert.deepEqual(await history(), before);
            const layout = await dialog.boundingBox();
            assert.ok(layout.x >= 0 && layout.x + layout.width <= 390, 'dialog fits mobile viewport');
            if (process.env.CONTEXT_LIMIT_SCREENSHOT && entry === 'index.html') {
                await page.screenshot({ path: process.env.CONTEXT_LIMIT_SCREENSHOT });
            }
            await page.keyboard.press('Escape');
            await expect(dialog).not.toBeVisible();
            await expect(input).toHaveValue('Keep this draft');
            assert.deepEqual(await history(), before);
            await send.click();
            await cancelReminder();
            await expect(input).toHaveValue('Keep this draft');
            assert.deepEqual(await history(), before);
            await sendWithReminder('Send after cancellation');
            assert.equal((await history()).length, 4);
            assert.ok(!(await history()).some(m => m.content.startsWith('Old ')), 'oldest history is trimmed only after sending');
            await sendWithoutReminder('No repeated reminder');

            // Same/decreased limits and unrelated settings must not rearm the reminder.
            await saveLimit(4);
            await sendWithoutReminder('Same limit');
            await saveLimit(3);
            await sendWithoutReminder('Lower limit');
            assert.equal((await history()).length, 3);
            await page.reload();
            await input.fill('After reload');
            await send.click();
            await cancelReminder();
            await expect(input).toHaveValue('After reload');
            await sendWithReminder('Confirm after reload cancellation');
            await sendWithoutReminder('Reload reminder accepted only once');

            // Increasing the limit rearms, but does not prompt until the new limit is reached.
            await saveLimit(5);
            await sendWithoutReminder('Reach the increased limit');
            assert.equal((await history()).length, 5);
            await input.fill('After increase');
            await send.click();
            await expect(dialog).toBeVisible();
            const increasedCount = requests.length;
            await proceed.click();
            await finished(increasedCount + 1);
            await sendWithoutReminder('Increased reminder shown only once');

            // A new conversation starts a fresh reminder cycle.
            await page.locator('#btn-clear').click();
            await page.locator('#btn-confirm-ok').click();
            await saveLimit(4);
            await sendWithoutReminder('New first');
            await sendWithoutReminder('New second');
            await input.fill('New third');
            await send.click();
            await cancelReminder();

            // Imported sessions, including oversized ones, wait for approval before trimming.
            await importHistory(6);
            const imported = await history();
            await input.fill('Loaded session');
            await send.click();
            await expect(dialog).toBeVisible();
            assert.deepEqual(await history(), imported);
            const importedCount = requests.length;
            await proceed.click();
            await finished(importedCount + 1);
            assert.equal((await history()).length, 4);
            await sendWithoutReminder('Imported reminder shown only once');

            // Quick responses share the same guard.
            await importHistory();
            await page.locator('.quick-response-btn').first().click();
            await cancelReminder();
            await page.locator('.quick-response-btn').first().click();
            await approveReminder();

            // Resend/edit cancellation must preserve the original history and editor.
            for (const edit of [false, true]) {
                await importHistory();
                const original = await history();
                await page.locator('.msg.user').last().click();
                if (edit) {
                    await page.locator('#btn-bubble-edit').click();
                    await page.locator('#bubble-edit-text').fill('Edited text');
                }
                const action = page.locator(edit ? '#btn-bubble-edit-send' : '#btn-bubble-resend');
                await action.click();
                await cancelReminder();
                assert.deepEqual(await history(), original);
                if (edit) await expect(page.locator('#bubble-edit-text')).toHaveValue('Edited text');
                await action.click();
                await approveReminder();
            }

            // Intent-enabled quick-response previews must retain both drafts when canceled.
            await importHistory();
            await page.evaluate(() => Settings.save({ ...Settings.get(), intentEnabled: true }));
            await input.fill('Main draft');
            await page.locator('.quick-response-btn').first().click();
            await expect(page.locator('#edit-intent-badge')).toHaveText('質問');
            const preview = await page.locator('#bubble-edit-text').inputValue();
            await page.locator('#btn-bubble-edit-send').click();
            await cancelReminder();
            await expect(input).toHaveValue('Main draft');
            await expect(page.locator('#bubble-edit-text')).toHaveValue(preview);
            await page.locator('#btn-bubble-edit-send').click();
            await approveReminder();

            // Starting a text call also sends history; cancellation must leave it on standby.
            await importHistory();
            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-setup').click();
            await page.locator('#setting-app-mode').selectOption('textCall');
            await page.locator('#btn-save-settings').click();
            await expect(page.locator('#settings-overlay')).not.toBeVisible();
            const callHistory = await history();
            await page.locator('#btn-start-call').click();
            await cancelReminder();
            await expect(page.locator('#call-standby')).toBeVisible();
            assert.deepEqual(await history(), callHistory);
            await page.locator('#btn-start-call').click();
            await approveReminder();
            await page.locator('#btn-end-call').click();

            assert.deepEqual(errors, []);
            console.log('PASS ' + entry + ': context limit, cancellation, one-time lifecycle, all message send paths');
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
