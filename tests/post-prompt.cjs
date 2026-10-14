// Post prompts belong only to chat API payloads. All API requests are mocked.
const { chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const entry of ['index.html', 'index_en.html', 'dist/index.html', 'dist/index_en.html']) {
            const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
            const page = await context.newPage();
            const errors = [], chats = [], intents = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => {
                localStorage.setItem('slowdialog_intro_seen', '1');
                if (!localStorage.getItem('slowdialog_settings')) {
                    localStorage.setItem('slowdialog_settings', JSON.stringify({
                        apiKey: 'test', baseUrl: 'https://postprompt.test/v1', systemPrompt: 'System instructions.',
                        charDelayMs: 1, minDelaySec: 0, soundEnabled: false, contextSize: 1000,
                        intentBaseUrl: 'https://postprompt.test', intentDelay: 0, intentChoices: '質問\n感謝',
                        // Existing settings deliberately have neither post-prompt setting.
                    }));
                }
            });
            let failNext = false, holdNext = false, releaseHeld;
            await page.route('**/chat/completions', async route => {
                chats.push(route.request().postDataJSON());
                if (holdNext) {
                    holdNext = false;
                    await new Promise(resolve => { releaseHeld = resolve; });
                }
                if (failNext) {
                    failNext = false;
                    return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
                }
                await route.fulfill({ contentType: 'text/event-stream',
                    body: 'data: {"choices":[{"delta":{"content":"OK."}}]}\n\ndata: [DONE]\n\n' }).catch(() => {});
            });
            await page.route('**/systemone', async route => {
                intents.push(route.request().postDataJSON());
                await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ answers: { intent: {
                    type: 'choice', choice: '質問', confidence: 1, probabilities: { '質問': 1, '感謝': 0 },
                } } }) });
            });
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
            const input = page.locator('#user-input');
            const field = page.locator('#setting-postprompt');
            const enabled = page.locator('#setting-postprompt-enabled');
            const history = () => page.evaluate(() => ChatHistory.getAll());
            const lastUser = () => chats.at(-1).messages.filter(m => m.role === 'user').at(-1).content;
            const finished = async count => {
                await expect.poll(() => chats.length).toBe(count);
                await page.waitForFunction(() => ChatHistory.peekLast()?.content === 'OK.'
                    && !document.querySelector('.typing-indicator, .pause-btn'));
            };
            const openSettings = async () => {
                await page.locator('#btn-settings').click();
                await page.locator('#settings-tab-setup').click();
            };
            const saveSettings = async () => {
                await page.locator('#btn-save-settings').click();
                await expect(page.locator('#settings-overlay')).toBeHidden();
            };
            const savePrompt = async prompt => {
                await openSettings();
                await field.fill(prompt);
                await saveSettings();
            };
            const send = async text => {
                const count = chats.length;
                await input.fill(text);
                if (await page.evaluate(() => Settings.get().intentEnabled)) {
                    await expect(page.locator('#intent-badge')).toHaveText('質問');
                }
                await page.locator('#btn-send').click();
                await finished(count + 1);
            };
            let prompt = '敬語で話すこと';
            const suffix = () => ` <system>${prompt}</system>`;

            await openSettings();
            await expect(field).toHaveValue('');
            await expect(enabled).not.toBeChecked();
            await expect(page.getByRole('checkbox', { name: entry.includes('_en')
                ? 'Enable post prompt' : 'ポストプロンプトを有効にする', exact: true })).toHaveCount(1);
            assert.equal(await page.evaluate(() => Settings.get().postPrompt), '');
            assert.equal(await page.evaluate(() => Settings.get().postPromptEnabled), false);
            assert.equal(await field.evaluate(el => el.closest('[role="tabpanel"]').id), 'settings-panel-setup');
            assert.equal(await field.evaluate(el => Boolean(document.getElementById('setting-systemprompt')
                .compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
            await field.fill('Canceled instructions');
            await enabled.check();
            await page.locator('#btn-cancel-settings').click();
            assert.equal(await page.evaluate(() => Settings.get().postPrompt), '');
            assert.equal(await page.evaluate(() => Settings.get().postPromptEnabled), false);
            await send('Without a post prompt');
            assert.equal(lastUser(), 'Without a post prompt');

            await savePrompt(' \n' + prompt + '\n ');
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('slowdialog_settings')).postPrompt), prompt);
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('slowdialog_settings')).postPromptEnabled), false);
            await page.reload();
            await openSettings();
            await expect(field).toHaveValue(prompt);
            await expect(field).toBeEditable();
            await expect(enabled).not.toBeChecked();
            await field.fill('Canceled replacement');
            await enabled.check();
            await page.locator('#btn-cancel-settings').click();
            await send('Stored while disabled');
            assert.equal(lastUser(), 'Stored while disabled', 'saving instructions alone does not enable them');
            assert.equal(await page.evaluate(() => Settings.get().postPrompt), prompt);
            assert.equal(await page.evaluate(() => Settings.get().postPromptEnabled), false);

            // An earlier version's saved text cannot implicitly enable the new switch.
            await page.evaluate(() => {
                const settings = JSON.parse(localStorage.getItem('slowdialog_settings'));
                delete settings.postPromptEnabled;
                localStorage.setItem('slowdialog_settings', JSON.stringify(settings));
            });
            await page.reload();
            assert.equal(await page.evaluate(() => Settings.get().postPromptEnabled), false);
            await send('Legacy switch absent');
            assert.equal(lastUser(), 'Legacy switch absent');
            await openSettings();
            await expect(field).toHaveValue(prompt);
            await expect(enabled).not.toBeChecked();
            await enabled.check();
            await saveSettings();
            assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('slowdialog_settings')).postPromptEnabled), true);
            await page.reload();
            await openSettings();
            await expect(field).toHaveValue(prompt);
            await expect(enabled).toBeChecked();
            await enabled.uncheck();
            await field.fill('Canceled enabled replacement');
            await page.locator('#btn-cancel-settings').click();
            assert.equal(await page.evaluate(() => Settings.get().postPromptEnabled), true);
            await send('こんにちは');
            assert.equal(lastUser(), 'こんにちは' + suffix());
            assert.equal(chats.at(-1).messages.find(m => m.role === 'user').content, 'Without a post prompt' + suffix());
            assert.equal(chats.at(-1).messages.find(m => m.role === 'system').content, 'System instructions.');
            assert.equal(chats.at(-1).messages.find(m => m.role === 'assistant').content, 'OK.');
            await expect(page.locator('.msg.user').last()).toHaveText('こんにちは');
            assert.equal((await history()).filter(m => m.role === 'user').at(-1).content, 'こんにちは');

            let count = chats.length;
            await page.locator('.msg.user').last().click();
            await page.locator('#btn-bubble-resend').click();
            await finished(count + 1);
            assert.equal(lastUser(), 'こんにちは' + suffix());
            count = chats.length;
            await page.locator('.msg.user').last().click();
            await page.locator('#btn-bubble-edit').click();
            await expect(page.locator('#bubble-edit-text')).toHaveValue('こんにちは');
            await page.locator('#bubble-edit-text').fill('Edited message');
            await page.locator('#btn-bubble-edit-send').click();
            await finished(count + 1);
            assert.equal(lastUser(), 'Edited message' + suffix());
            await expect(page.locator('.msg.user').last()).toHaveText('Edited message');

            failNext = true;
            await input.fill('Retry message');
            await page.locator('#btn-send').click();
            await expect(page.locator('#retry-bar')).toBeVisible();
            assert.equal(lastUser(), 'Retry message' + suffix());
            prompt = 'Be brief.';
            await savePrompt(prompt);
            count = chats.length;
            await page.locator('#btn-retry').click();
            await finished(count + 1);
            assert.equal(lastUser(), 'Retry message' + suffix(), 'retry uses the current prompt once');

            holdNext = true;
            count = chats.length;
            await input.fill('First interruption');
            await page.locator('#btn-send').click();
            await expect.poll(() => chats.length).toBe(count + 1);
            await send('Second interruption');
            assert.equal(lastUser(), 'First interruption\nSecond interruption' + suffix());
            assert.equal((await history()).filter(m => m.role === 'user').at(-1).content,
                'First interruption\nSecond interruption');
            await expect(page.locator('.msg.user').last()).toHaveText('First interruption\nSecond interruption');
            releaseHeld();

            // Existing intent, mode and timestamp metadata must all precede the final post prompt.
            const snapshot = await page.evaluate(() => {
                ChatHistory.importJSON([
                    { role: 'user', content: 'Earlier question', timestamp: '2026-01-02T03:04:00Z' },
                    { role: 'assistant', content: 'Earlier answer' },
                    { role: 'user', content: 'Metadata question', intents: [{ end: 17, label: '質問' }],
                        timestamp: '2026-01-02T03:05:00Z' },
                ]);
                Settings.save({ ...Settings.get(), sendTimestamp: true });
                const before = JSON.stringify(ChatHistory.getAll());
                const api = ChatHistory.buildApiMessages('#mode');
                return { before, after: JSON.stringify(ChatHistory.getAll()), api,
                    repeated: ChatHistory.buildApiMessages('#mode'), stored: localStorage.getItem('slowdialog_history') };
            });
            assert.equal(snapshot.before, snapshot.after);
            assert.equal(snapshot.before, snapshot.stored);
            assert.deepEqual(snapshot.api, snapshot.repeated);
            assert.match(snapshot.api.at(-1).content, /^Metadata question \[質問\] #mode<timestamp>[^<]+<\/timestamp> <system>Be brief\.<\/system>$/);
            for (const message of snapshot.api.filter(m => m.role === 'user')) assert.ok(message.content.endsWith(suffix()));
            const exported = await page.evaluate(async () => {
                const createURL = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
                let blob;
                URL.createObjectURL = value => { blob = value; return createURL.call(URL, value); };
                HTMLAnchorElement.prototype.click = () => {};
                try { ChatHistory.exportJSON(); return JSON.parse(await blob.text()); }
                finally { URL.createObjectURL = createURL; HTMLAnchorElement.prototype.click = click; }
            });
            assert.deepEqual(exported.filter(m => ['user', 'assistant'].includes(m.role)), JSON.parse(snapshot.before));
            assert.equal(JSON.stringify(exported).includes(prompt), false, 'export contains no post-prompt instructions');

            await page.evaluate(() => Settings.save({ ...Settings.get(), intentEnabled: true, intentTracking: true }));
            await page.reload();
            count = chats.length;
            await input.fill('Intent question');
            await expect(page.locator('#intent-badge')).toHaveText('質問');
            assert.equal(intents.at(-1).state.message, 'Intent question');
            assert.deepEqual(intents.at(-1).state.conversation.map(m => m.content),
                ['Earlier question', 'Earlier answer', 'Metadata question']);
            assert.equal(JSON.stringify(intents.at(-1)).includes(prompt), false, 'intent API does not receive the post prompt');
            await page.locator('#btn-send').click();
            await finished(count + 1);
            assert.match(lastUser(), /^Intent question \[質問\]<timestamp>[^<]+<\/timestamp> <system>Be brief\.<\/system>$/);
            assert.equal((await history()).filter(m => m.role === 'user').at(-1).content, 'Intent question');
            await expect(page.locator('.msg.user').last()).toHaveText('Intent question');

            // Switching off retains editable text; switching back on reuses the saved text.
            await openSettings();
            await enabled.uncheck();
            await saveSettings();
            assert.equal(await page.evaluate(() => Settings.get().postPromptEnabled), false);
            assert.equal(await page.evaluate(() => Settings.get().postPrompt), prompt);
            await page.reload();
            await openSettings();
            await expect(enabled).not.toBeChecked();
            await expect(field).toHaveValue(prompt);
            await expect(field).toBeEditable();
            await page.locator('#btn-cancel-settings').click();
            await send('Switch disabled');
            for (const message of chats.at(-1).messages) assert.equal(message.content.includes('<system>'), false);
            await openSettings();
            await enabled.check();
            await saveSettings();
            await send('Switch enabled again');
            assert.ok(lastUser().endsWith(suffix()));
            assert.equal(await page.evaluate(() => Settings.get().postPrompt), prompt);

            await savePrompt(' \n\t ');
            assert.equal(await page.evaluate(() => Settings.get().postPrompt), '');
            assert.equal(await page.evaluate(() => Settings.get().postPromptEnabled), true);
            await send('Enabled with empty instructions');
            for (const message of chats.at(-1).messages) assert.equal(message.content.includes('<system>'), false);
            await page.reload();
            await openSettings();
            await expect(field).toHaveValue('');
            await expect(enabled).toBeChecked();
            prompt = 'Call instructions.';
            await field.fill(prompt);
            await enabled.check();
            await page.locator('#setting-app-mode').selectOption('textCall');
            await saveSettings();
            count = chats.length;
            await page.locator('#btn-start-call').click();
            await finished(count + 1);
            const call = (await history()).filter(m => m.role === 'user').at(-1).content;
            assert.ok(call.startsWith('<SYSTEM>Ringring!'));
            assert.equal(call.includes(prompt), false);
            assert.ok(lastUser().startsWith(call));
            assert.ok(lastUser().endsWith(suffix()));
            await expect(page.locator('.msg.user').last()).toHaveText(entry.includes('_en') ? '*Call started*' : '*通話を開始しました*');
            await page.locator('#btn-end-call').click();

            assert.deepEqual(errors, []);
            console.log('PASS ' + entry + ': post-prompt settings, API-only suffix, metadata, export, intent and send paths');
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
