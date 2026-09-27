// Run with Node.js + Playwright and installed Edge. All API requests are mocked.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const entry of ['index.html', 'index_en.html', 'dist/index.html', 'dist/index_en.html']) {
            const ja = !entry.includes('_en');
            const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
            const page = await context.newPage();
            const errors = [], requests = [], requestUrls = [], chats = [];
            page.on('pageerror', error => errors.push(error.message));
            let confidence = 0.9, malformed = false, slow = false, fail = false, certain = false;
            await page.route('**/v1/systemone', async route => {
                const body = route.request().postDataJSON();
                requests.push(body);
                requestUrls.push(route.request().url());
                if (slow) await new Promise(resolve => setTimeout(resolve, 700));
                const probabilities = certain
                    ? Object.fromEntries(Object.keys(body.questions.intent.criteria).map(choice => [choice, choice === '感謝' ? 1 : 0]))
                    : { '質問': 0.1, '修正要求': 0.15, '要共感': 0.5, '怒り': 0.15, '独自の選択肢': 0.1 };
                await route.fulfill({ status: fail ? 500 : 200, contentType: 'application/json', body: JSON.stringify({ answers: { intent: malformed ? {} : { type: 'choice', choice: certain ? '感謝' : '要共感', confidence: certain ? 1 : confidence, probabilities } } }) }).catch(() => {});
            });
            await page.route('**/chat/completions', async route => {
                chats.push(route.request().postDataJSON());
                await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"OK."}}]}\n\ndata: [DONE]\n\n' });
            });
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
            await page.locator('#btn-intro-next').click();
            await page.locator('#setting-apikey').fill('chat-test');
            await page.locator('#settings-tab-intent').click();
            assert.equal(await page.locator('#intent-Enabled').isChecked(), false);
            assert.equal(await page.locator('#intent-Delay').inputValue(), '0.5');
            assert.equal(await page.locator('#intent-Confidence').inputValue(), '0.65');
            assert.equal(await page.locator('#intent-Model').inputValue(), '~typesafe/jev-latest');
            await page.locator('#intent-Enabled').check();
            await page.locator('#intent-BaseUrl').fill('https://api.typesafe.ai/');
            await page.locator('#intent-ApiKey').fill('intent-test');
            await page.locator('#intent-Choices').fill('質問\n修正要求\n要共感\n怒り\n独自の選択肢');
            await page.locator('#btn-save-settings').click();
            await page.waitForFunction(() => document.querySelector('#settings-overlay').classList.contains('hidden'));
            const input = page.locator('#user-input'), badge = page.locator('#intent-badge');
            await input.fill('今日は');
            await page.waitForTimeout(150);
            await input.fill('今日はつかれたな～');
            await page.waitForTimeout(150);
            assert.equal(requests.length, 0, 'debounce');
            await input.press('Enter');
            assert.equal(chats.length, 0, 'pending intent cannot bypass preview');
            assert.equal(await input.evaluate(el => el === document.activeElement), true);
            await page.waitForFunction(() => document.querySelector('#intent-badge').textContent === '要共感');
            assert.equal(requests.length, 1);
            assert.equal(requestUrls[0], 'https://api.typesafe.ai/v1/systemone');
            assert.equal(requests[0].state.message, '今日はつかれたな～');
            assert.equal(requests[0].state.conversation, undefined);
            assert.equal(requests[0].questions.intent.type, 'choice');
            assert.deepEqual(requests[0].questions.intent.criteria, {
                '質問': '質問', '修正要求': '修正要求', '要共感': '要共感',
                '怒り': '怒り', '独自の選択肢': '独自の選択肢',
            });
            assert.match(requests[0].questions.intent.instructions, /out of character/);
            assert.equal(requests[0].model, '~typesafe/jev-latest');
            const box = await badge.boundingBox(), sendBox = await page.locator('#btn-send').boundingBox();
            assert.equal(box.height, sendBox.height);
            assert.ok(box.x + box.width <= sendBox.x);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await badge.focus();
            await page.keyboard.press('Enter');
            assert.deepEqual(await page.locator('#intent-options .intent-choice-label').allTextContents(), ['要共感', '修正要求', '怒り', '質問', '独自の選択肢']);
            assert.deepEqual(await page.locator('.intent-choice-probability').allTextContents(), ['50.0%', '15.0%', '15.0%', '10.0%', '10.0%']);
            await page.keyboard.press('Escape');
            await page.waitForFunction(() => document.activeElement.id === 'intent-badge');
            await page.locator('#btn-send').click();
            await page.waitForFunction(() => JSON.parse(localStorage.getItem('slowdialog_history')).some(m => m.intents?.length));
            assert.equal(chats[0].messages.find(m => m.role === 'user').content, '今日はつかれたな～ [要共感]');
            assert.equal(await page.locator('.msg.user').last().textContent(), '今日はつかれたな～');
            assert.match(await page.locator('.msg-timestamp.user').last().textContent(), /^要共感 · /);
            await page.reload();
            assert.match(await page.locator('.msg-timestamp.user').last().textContent(), /^要共感 · /);

            // 編集時に再分類が行われる。confidence が閾値と等しい場合も受け入れる
            // Editing reclassifies; equality with the confidence threshold is accepted.
            confidence = 0.65;
            await page.locator('.msg.user').first().click();
            await page.locator('#btn-bubble-edit').click();
            await page.locator('#bubble-edit-text').fill('Edited draft');
            await page.waitForFunction(() => document.querySelector('#edit-intent-badge').textContent === '要共感');
            await page.locator('#btn-bubble-edit-send').click();
            await page.waitForTimeout(100);
            assert.equal(chats.at(-1).messages.filter(m => m.role === 'user').at(-1).content, 'Edited draft [要共感]');
            await page.locator('.quick-response-btn').first().click();
            assert.ok(await page.locator('#bubble-edit-text').inputValue());
            await page.locator('#btn-bubble-edit-cancel').click();
            await input.fill('');

            // IMEの変換中テキストを分類しない
            // Do not classify IME pre-edit text.
            const beforeIME = requests.length;
            await input.dispatchEvent('compositionstart');
            await input.fill('変換中');
            await page.waitForTimeout(550);
            assert.equal(requests.length, beforeIME);
            await input.dispatchEvent('compositionend');
            await page.waitForFunction(() => document.querySelector('#intent-badge').textContent === '要共感');

            confidence = 0.64;
            await input.fill('なぜ？');
            await page.waitForFunction(() => document.querySelector('#intent-badge').classList.contains('intent-uncertain'));
            assert.equal(await badge.textContent(), ja ? '判定不能(要共感?)' : 'Unclear intent(要共感?)');
            await badge.click();
            assert.deepEqual(await page.locator('#intent-options .intent-choice-label').allTextContents(), ['要共感', '修正要求', '怒り', '質問', '独自の選択肢']);
            assert.deepEqual(await page.locator('.intent-choice-probability').allTextContents(), ['50.0%', '15.0%', '15.0%', '10.0%', '10.0%']);
            await page.locator('#btn-close-intent').click();
            await page.waitForFunction(() => document.activeElement.id === 'user-input');
            await badge.tap();
            await page.locator('#intent-options button').first().waitFor({ state: 'visible' });
            await page.locator('#btn-close-intent').tap();
            await page.waitForFunction(() => document.activeElement.id === 'user-input');
            const count = chats.length;
            await page.locator('#btn-send').click();
            await page.locator('#intent-confirm').waitFor({ state: 'visible' });
            assert.equal(chats.length, count);
            assert.equal(await page.locator('#intent-confirm-message').textContent(), ja ? '意図が不明確ですが、送信しますか？' : 'Your intent is unclear. Do you really want to send?');
            assert.equal(await page.locator('#btn-intent-confirm-cancel').evaluate(el => el === document.activeElement), true);
            await page.locator('#btn-intent-confirm-cancel').click();
            assert.equal(await input.inputValue(), 'なぜ？');
            assert.equal(await page.locator('#intent-confirm').isVisible(), false);
            await page.locator('#btn-send').click();
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('#intent-confirm').isVisible(), false);
            assert.equal(chats.length, count);
            await badge.click();
            await page.locator('#intent-options .intent-choice-label').filter({ hasText: /^質問$/ }).click();
            await page.waitForFunction(() => document.activeElement.id === 'user-input');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(100);
            assert.equal(chats.at(-1).messages.filter(m => m.role === 'user').at(-1).content, 'なぜ？ [質問]');

            // 遅延したネットワーク結果は手動選択および新しい上書きを置換しない
            // A late network result must not replace a manual choice or a newer draft.
            confidence = 0.9; slow = true;
            await input.fill('slow');
            await page.waitForTimeout(550);
            await badge.click();
            assert.equal(await page.locator('.intent-choice-probability').count(), 0);
            await page.locator('#btn-remove-intent').click();
            await page.waitForTimeout(800);
            assert.equal(await badge.textContent(), ja ? 'タグなし' : 'No tag');
            await page.locator('#btn-send').click();
            await page.waitForTimeout(100);
            assert.equal(chats.at(-1).messages.filter(m => m.role === 'user').at(-1).content, 'slow');
            await input.fill('obsolete');
            await page.waitForTimeout(550);
            await input.fill('new');
            await page.waitForTimeout(250);
            assert.equal(await badge.textContent(), ja ? '判定中…' : 'Checking…');
            await input.fill('');
            await page.waitForTimeout(900);
            assert.equal(await badge.isVisible(), false);
            slow = false;

            // 追跡機能はユーザー＋AI返答を3ターンにまとめ、メタデータタグは除外する
            // Tracking groups user + assistant replies into three turns, without metadata tags.
            await page.evaluate(() => {
                ChatHistory.clear();
                for (let i = 0; i < 4; i++) { ChatHistory.push('user', 'User ' + i, '質問'); ChatHistory.push('assistant', 'Reply ' + i); }
                Settings.save({ ...Settings.get(), intentTracking: true });
            });
            await input.fill('follow up');
            await page.waitForFunction(() => document.querySelector('#intent-badge').textContent === '要共感');
            assert.deepEqual(requests.at(-1).state.conversation.map(m => m.content), ['User 1', 'Reply 1', 'User 2', 'Reply 2', 'User 3', 'Reply 3']);
            assert.equal(JSON.stringify(requests.at(-1).state.conversation).includes('質問'), false);
            assert.equal(await page.evaluate(() => SystemOneIntent.endpoint('https://example.com/v1/')), 'https://example.com/v1/systemone');
            assert.equal(await page.evaluate(() => SystemOneIntent.endpoint('https://example.com/v1/systemone')), 'https://example.com/v1/systemone');
            for (const base of ['https://api.typesafe.ai', 'https://api.typesafe.ai/', 'https://api.typesafe.ai///', 'https://api.typesafe.ai/v1/', 'https://api.typesafe.ai/v1/systemone/']) {
                assert.equal(await page.evaluate(base => SystemOneIntent.endpoint(base), base), 'https://api.typesafe.ai/v1/systemone');
            }
            assert.equal(await page.evaluate(() => SystemOneIntent.endpoint('https://openrouter.ai/api/')), 'https://openrouter.ai/api/v1/systemone');
            malformed = true;
            await input.fill('invalid response');
            await page.waitForFunction(() => document.querySelector('#intent-badge').classList.contains('intent-uncertain'));
            assert.equal(await badge.textContent(), ja ? '通信異常' : 'Connection error');
            await page.locator('#btn-send').click();
            assert.equal(await page.locator('#intent-confirm-message').textContent(), ja ? '通信異常により意図を判定できませんでした。本当に送信しますか？' : 'Intent could not be checked due to a connection error. Do you really want to send?');
            await page.locator('#btn-intent-confirm-send').click();
            await page.waitForTimeout(100);
            assert.equal(chats.at(-1).messages.filter(m => m.role === 'user').at(-1).content, 'invalid response');
            malformed = false; fail = true;
            await input.fill('network failure');
            await page.waitForFunction(() => document.querySelector('#intent-badge').classList.contains('intent-uncertain'));
            assert.equal(await badge.textContent(), ja ? '通信異常' : 'Connection error');
            await badge.click();
            assert.equal(await page.locator('.intent-choice-probability').count(), 0);
            assert.deepEqual(await page.locator('#intent-options .intent-choice-label').allTextContents(), ['質問', '修正要求', '要共感', '怒り', '独自の選択肢']);
            await page.locator('#btn-close-intent').click();
            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-intent').click();
            await page.locator('#intent-Enabled').uncheck();
            await page.locator('#btn-save-settings').click();
            await page.waitForFunction(() => document.querySelector('#settings-overlay').classList.contains('hidden'));
            assert.equal(await badge.isVisible(), false);
            await page.locator('#btn-send').click();
            await page.waitForTimeout(100);
            assert.equal(chats.at(-1).messages.filter(m => m.role === 'user').at(-1).content.includes('[要共感]'), false);
            // Confidence 1 must still sort by probability, including after removing the tag.
            fail = false; certain = true;
            await page.evaluate(() => Settings.save({ ...Settings.get(), intentEnabled: true, intentChoices: '質問\n感謝\n謝罪' }));
            await input.fill('ありがとう');
            await page.waitForFunction(() => document.querySelector('#intent-badge').textContent === '感謝');
            await badge.click();
            assert.deepEqual(await page.locator('#intent-options .intent-choice-label').allTextContents(), ['感謝', '質問', '謝罪']);
            assert.deepEqual(await page.locator('.intent-choice-probability').allTextContents(), ['100.0%', '0.0%', '0.0%']);
            await page.locator('#btn-remove-intent').click();
            await page.waitForFunction(() => document.activeElement.id === 'user-input');
            await badge.click();
            assert.deepEqual(await page.locator('#intent-options .intent-choice-label').allTextContents(), ['感謝', '質問', '謝罪']);
            await page.locator('#btn-close-intent').click();
            assert.deepEqual(errors, []);
            console.log('PASS ' + entry);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
