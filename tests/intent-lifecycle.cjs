// Lifecycle regressions: drafts, manual choices, history invalidation and interruption.
const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const entry of ['index.html', 'index_en.html', 'dist/index.html', 'dist/index_en.html']) {
            const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
            const page = await context.newPage();
            const errors = [], requests = [], chats = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => {
                localStorage.setItem('slowdialog_intro_seen', '1');
                localStorage.setItem('slowdialog_settings', JSON.stringify({ apiKey: 'test', intentEnabled: true,
                    intentDelay: 0.1, intentChoices: '質問\n修正要求', soundEnabled: false }));
            });
            let release, delayNext = false, blockChat = false;
            const pendingChats = [];
            await page.route('**/systemone', async route => {
                requests.push(route.request().postDataJSON());
                const delayed = delayNext;
                delayNext = false;
                if (delayed) await new Promise(resolve => { release = resolve; });
                await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ answers: { intent: {
                    type: 'choice', choice: delayed ? '修正要求' : '質問', confidence: 1,
                } } }) }).catch(() => {});
            });
            await page.route('**/chat/completions', async route => {
                chats.push(route.request().postDataJSON());
                if (blockChat) await new Promise(resolve => pendingChats.push(resolve));
                await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"OK."}}]}\n\ndata: [DONE]\n\n' }).catch(() => {});
            });
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
            const input = page.locator('#user-input'), badge = page.locator('#intent-badge');
            const waitLabel = label => page.waitForFunction(label => document.querySelector('#intent-badge').textContent === label, label);
            const choose = async label => {
                await badge.click();
                if (label) await page.locator('#intent-options button').filter({ hasText: new RegExp('^' + label + '$') }).click();
                else await page.locator('#intent-options button').last().click();
            };
            await input.fill('Unsent draft');
            await waitLabel('質問');
            await choose('修正要求');
            for (const send of [false, true]) {
                await page.locator('.quick-response-btn').first().click();
                assert.equal(await input.inputValue(), 'Unsent draft');
                await page.waitForFunction(() => document.querySelector('#edit-intent-badge').textContent === '質問');
                await page.locator(send ? '#btn-bubble-edit-send' : '#btn-bubble-edit-cancel').click();
                assert.equal(await input.inputValue(), 'Unsent draft');
                assert.equal(await badge.textContent(), '修正要求');
            }
            for (const theme of ['blue', 'red']) {
                const count = requests.length;
                await page.locator('#btn-settings').click();
                await page.locator('#settings-tab-display').click();
                await page.locator('#setting-theme').selectOption(theme);
                await page.locator('#btn-save-settings').click();
                await page.waitForFunction(() => document.querySelector('#settings-overlay').classList.contains('hidden'));
                await page.waitForTimeout(250);
                assert.equal(requests.length, count, 'unrelated settings do not reclassify');
                assert.equal(await badge.textContent(), theme === 'blue' ? '修正要求' : (entry.includes('_en') ? 'No tag' : 'タグなし'));
                if (theme === 'blue') await choose(null);
            }
            // A classification setting change does invalidate a manual override.
            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-intent').click();
            await page.locator('#intent-Instructions').fill('Prefer literal interpretation.');
            await page.locator('#intent-Tracking').check();
            await page.locator('#btn-save-settings').click();
            await waitLabel('質問');
            for (const change of ['clear', 'import', 'truncate', 'reply']) {
                await input.fill('');
                await page.evaluate(() => {
                    ChatHistory.clear(); ChatHistory.push('user', 'Old topic'); ChatHistory.push('assistant', 'Old reply');
                });
                delayNext = true;
                const count = requests.length;
                await input.fill('Why? ' + change);
                await page.waitForFunction(() => document.querySelector('#intent-badge').textContent.includes('…'));
                while (requests.length === count) await page.waitForTimeout(20);
                if (change === 'clear') {
                    await page.locator('#btn-clear').click();
                    await page.locator('#btn-confirm-ok').click();
                } else await page.evaluate(change => {
                    if (change === 'import') ChatHistory.importJSON([{ role: 'user', content: 'New topic', timestamp: new Date().toISOString() }]);
                    if (change === 'truncate') ChatHistory.truncateFrom(1);
                    if (change === 'reply') ChatHistory.updateLast('New reply');
                }, change);
                await waitLabel('質問');
                release();
                await page.waitForTimeout(100);
                assert.equal(await badge.textContent(), '質問', 'obsolete context response discarded');
                assert.equal(requests.length, count + 2);
                const contents = requests.at(-1).state.conversation.map(m => m.content);
                assert.deepEqual(contents, change === 'clear' ? [] : change === 'import' ? ['New topic'] : change === 'truncate' ? ['Old topic'] : ['Old topic', 'New reply']);
            }
            await input.fill('');
            await page.locator('#btn-clear').click();
            await page.locator('#btn-confirm-ok').click();
            blockChat = true;
            for (const [content, label] of [['First\nline', '質問'], ['Second', '修正要求'], ['Third', null]]) {
                await input.fill(content);
                await waitLabel('質問');
                if (label !== '質問') await choose(label);
                await page.locator('#btn-send').click();
            }
            const snapshot = await page.evaluate(() => ({ history: ChatHistory.getAll(), api: ChatHistory.buildApiMessages() }));
            const users = snapshot.history.filter(m => m.role === 'user');
            assert.equal(users.length, 1, 'interruptions still merge user messages');
            assert.equal(users[0].content, 'First\nline\nSecond\nThird');
            assert.deepEqual(users[0].intents, [{ end: 10, label: '質問' }, { end: 17, label: '修正要求' }]);
            assert.equal(snapshot.api.find(m => m.role === 'user').content, 'First\nline [質問]\nSecond [修正要求]\nThird');
            assert.equal(chats.at(-1).messages.find(m => m.role === 'user').content, snapshot.api.find(m => m.role === 'user').content);
            assert.equal(await page.locator('.msg.user').count(), 1);
            assert.equal(await page.locator('.msg.assistant').count(), 0);
            assert.equal(await page.locator('.msg.user').textContent(), users[0].content);
            assert.match(await page.locator('.msg-timestamp.user').textContent(), /^質問 \/ 修正要求 · /);
            // JSON export/import representation keeps boundaries without putting tags into plain history.
            await page.evaluate(() => ChatHistory.importJSON(JSON.parse(JSON.stringify(ChatHistory.getAll()))));
            assert.equal(await page.evaluate(() => ChatHistory.buildApiMessages().find(m => m.role === 'user').content), snapshot.api.find(m => m.role === 'user').content);
            pendingChats.forEach(resolve => resolve());
            await page.reload();
            assert.equal(await page.locator('.msg.user').textContent(), users[0].content);
            assert.match(await page.locator('.msg-timestamp.user').textContent(), /^質問 \/ 修正要求 · /);
            assert.deepEqual(errors, []);
            console.log('PASS ' + entry + ': draft/manual preservation, context invalidation, tagged interruption');
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
