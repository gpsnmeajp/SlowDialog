// Browser-level microphone/Deepgram lifecycle tests. No external API calls.
const { chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { wsServer: WebSocketServer } = require('playwright-core/lib/utilsBundle');

function installMocks() {
    localStorage.setItem('slowdialog_intro_seen', '1');
    if (!localStorage.getItem('slowdialog_settings')) localStorage.setItem('slowdialog_settings', JSON.stringify({
        apiKey: 'chat-key', baseUrl: 'https://chat.test/v1', soundEnabled: false, charDelayMs: 0, minDelaySec: 0,
    }));
    const stt = window.stt = { sockets: [], streams: [], recorders: [], autoClose: true };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
        if (stt.permissionError) throw new DOMException('Denied', stt.permissionError);
        if (stt.delayPermission) await new Promise(resolve => { stt.allowPermission = resolve; });
        const track = { stopped: false, stop() { this.stopped = true; } };
        const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
        stt.streams.push(stream);
        return stream;
    } });
    window.MediaRecorder = class {
        static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
        constructor(stream, options) { this.stream = stream; this.options = options; this.state = 'inactive'; stt.recorders.push(this); }
        start(interval) {
            this.state = 'recording'; this.interval = interval;
            this.ondataavailable?.({ data: new Blob(['first']) });
        }
        stop() {
            this.state = 'inactive';
            setTimeout(() => {
                this.ondataavailable?.({ data: new Blob(['tail']) });
                this.onstop?.();
            }, 0);
        }
    };
    window.WebSocket = class {
        static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
        constructor(url, protocols) {
            this.url = url; this.protocols = protocols; this.readyState = 0; this.bufferedAmount = 0; this.sent = [];
            stt.sockets.push(this);
            if (!stt.holdOpen) setTimeout(() => this.open(), 0);
        }
        open() { if (this.readyState !== 0) return; this.readyState = 1; this.onopen?.(); }
        result(transcript, is_final = false, start = 0) {
            this.onmessage?.({ data: JSON.stringify({ type: 'Results', start, duration: 1, is_final, channel: { alternatives: [{ transcript }] } }) });
        }
        send(data) {
            this.sent.push(data);
            if (typeof data === 'string' && JSON.parse(data).type === 'CloseStream' && stt.autoClose) {
                setTimeout(() => {
                    if (stt.finalText) this.result(stt.finalText, true, 10);
                    this.close();
                }, 0);
            }
        }
        close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
    };
}

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true,
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    let localPeer;
    try {
        for (const entry of ['index.html', 'index_en.html', 'dist/index.html', 'dist/index_en.html']) {
            const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
            const page = await context.newPage();
            const errors = [], chats = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(installMocks);
            await page.route('**/chat/completions', async route => {
                chats.push(route.request().postDataJSON());
                await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"OK."}}]}\n\ndata: [DONE]\n\n' });
            });
            const url = pathToFileURL(path.resolve(__dirname, '..', entry)).href;
            await page.goto(url);
            const mic = page.locator('#btn-microphone'), input = page.locator('#user-input');
            const state = value => expect(mic).toHaveAttribute('data-state', value);
            const emit = (text, final = false, start = 0) => page.evaluate(([text, final, start]) => stt.sockets.at(-1).result(text, final, start), [text, final, start]);
            const settings = async () => {
                await page.locator('#btn-settings').click();
                await page.locator('#settings-tab-recognition').click();
            };
            const save = async () => {
                await page.locator('#btn-save-settings').click();
                await expect(page.locator('#settings-overlay')).toBeHidden();
            };
            const tracksStopped = async () => assert.equal(await page.evaluate(() => stt.streams.every(s => s.getTracks().every(t => t.stopped))), true);
            await expect(mic).toBeDisabled();
            await expect(mic).toBeHidden();
            await expect(page.locator('#microphone-status')).toBeHidden();
            const compactHeight = await page.locator('#input-area').evaluate(el => el.getBoundingClientRect().height);
            assert.equal(await page.evaluate(() => stt.streams.length), 0, 'no capture before user activation');
            await settings();
            await expect(page.locator('#deepgram-settings')).toBeHidden();
            await page.locator('#setting-deepgram-enabled').check();
            await expect(page.locator('#deepgram-settings')).toBeVisible();
            await expect(page.locator('#setting-deepgram-apikey')).toHaveAttribute('type', 'password');
            await expect(page.locator('#setting-deepgram-language')).toHaveValue(entry.includes('_en') ? 'en' : 'ja');
            await expect(page.locator('#setting-deepgram-model')).toHaveValue('nova-3');
            assert.equal(await page.locator('#deepgram-settings .settings-note').count(), 1, 'only microphone permission help remains');
            await save();
            await expect(mic).toBeVisible();
            assert.ok(await page.locator('#input-area').evaluate(el => el.getBoundingClientRect().height) > compactHeight);
            await mic.click();
            await expect(page.locator('#microphone-status')).toContainText('Deepgram API');
            assert.equal(await page.evaluate(() => stt.sockets.length), 0);
            await settings();
            await page.locator('#setting-deepgram-apikey').fill('  private-deepgram-key  ');
            await save();
            await page.reload();
            await expect(mic).toBeEnabled();
            assert.equal(await page.evaluate(() => Settings.get().deepgramApiKey), 'private-deepgram-key');

            // Tap toggles; interim revisions replace each other and finals append once.
            await input.fill('Draft');
            await mic.click();
            await state('listening');
            await expect(mic).toHaveAttribute('aria-pressed', 'true');
            const connection = await page.evaluate(() => ({ url: stt.sockets[0].url, protocols: stt.sockets[0].protocols,
                chunks: stt.sockets[0].sent.filter(x => x instanceof Blob).length, interval: stt.recorders[0].interval }));
            const params = new URL(connection.url).searchParams;
            assert.equal(params.get('model'), 'nova-3');
            assert.equal(params.get('language'), entry.includes('_en') ? 'en' : 'ja');
            assert.equal(params.get('interim_results'), 'true');
            assert.equal(params.has('encoding'), false);
            assert.equal(connection.url.includes('private-deepgram-key'), false);
            assert.deepEqual(connection.protocols, ['token', 'private-deepgram-key']);
            assert.equal(connection.chunks, 1, 'initial audio captured during handshake is sent');
            assert.equal(connection.interval, 250);
            await emit('hel'); await expect(input).toHaveValue('Draft hel');
            await emit('hello'); await expect(input).toHaveValue('Draft hello');
            await emit('Hello.', true); await emit('Hello.', true);
            await emit('world', false, 1); await expect(input).toHaveValue('Draft Hello. world');
            await emit('World.', true, 1); await expect(input).toHaveValue('Draft Hello. World.');
            await mic.click(); await state('idle'); await tracksStopped();
            assert.deepEqual(await page.evaluate(() => stt.sockets[0].sent.map(x => typeof x === 'string' ? JSON.parse(x).type : 'audio')), ['audio', 'audio', 'CloseStream']);
            assert.equal(chats.length, 0, 'stopping recognition never sends a chat message');

            // Silence, repeated interim results and an unchanged final result
            // must not restart intent classification or erase a manual choice.
            const intentRequests = [];
            await page.route('**/systemone', async route => {
                intentRequests.push(route.request().postDataJSON().state.message);
                await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ answers: { intent: {
                    type: 'choice', choice: 'Question', confidence: 1,
                    probabilities: { Question: 1, Correction: 0 },
                } } }) });
            });
            await page.evaluate(() => Settings.save({ ...Settings.get(), intentEnabled: true, intentDelay: 0.1,
                intentBaseUrl: 'https://intent.test/v1', intentChoices: 'Question\nCorrection' }));
            const badge = page.locator('#intent-badge');
            await input.fill('Seed'); await expect(badge).toHaveText('Question');
            assert.deepEqual(intentRequests, ['Seed']);
            await mic.click(); await state('listening');
            await emit(''); await emit('', true); await emit('', true, 1);
            await page.waitForTimeout(180);
            assert.deepEqual(intentRequests, ['Seed'], 'silence must not reclassify an unchanged draft');
            await emit('Hello.', false, 2); await expect(badge).toHaveText('Question');
            assert.deepEqual(intentRequests, ['Seed', 'Seed Hello.']);
            await emit('Hello.', false, 2); await emit('Hello.', true, 2); await emit('', false, 3);
            await page.waitForTimeout(180);
            assert.deepEqual(intentRequests, ['Seed', 'Seed Hello.'], 'identical interim/final text must not reclassify');
            await badge.click();
            await page.locator('#intent-options .intent-choice-label').filter({ hasText: /^Correction$/ }).click();
            await emit('', true, 3); await emit('', false, 4);
            await page.waitForTimeout(180);
            await expect(badge).toHaveText('Correction');
            assert.equal(intentRequests.length, 2, 'silence preserves manually selected intent');
            // Finalization must still update committed text even when it skips
            // the input event, so the next utterance appends exactly once.
            await emit('World.', false, 4); await expect(badge).toHaveText('Question');
            await expect(input).toHaveValue('Seed Hello. World.');
            await emit('There.', false, 4); await expect(badge).toHaveText('Question');
            assert.deepEqual(intentRequests, ['Seed', 'Seed Hello.', 'Seed Hello. World.', 'Seed Hello. There.'], 'same-length corrections still reclassify');
            await emit('There.', true, 4); await emit('', false, 5);
            await page.waitForTimeout(180);
            assert.equal(intentRequests.length, 4);
            await mic.click(); await state('idle');
            await page.evaluate(() => Settings.save({ ...Settings.get(), intentEnabled: false }));
            await input.fill('');

            // PTT releases outside the button and captures even before 350 ms.
            await input.fill('');
            const box = await mic.boundingBox();
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down(); await state('listening');
            await emit('こんにちは', true); await emit('世界。', true, 1);
            await expect(input).toHaveValue('こんにちは世界。');
            await page.waitForTimeout(380);
            await page.mouse.move(5, 5); await page.mouse.up();
            await state('idle'); await tracksStopped();

            // A pending permission grant after PTT release must never start recording.
            await page.evaluate(() => { stt.delayPermission = true; });
            const count = await page.evaluate(() => stt.sockets.length);
            await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
            await state('starting'); await page.waitForTimeout(380); await page.mouse.up();
            await state('idle');
            await page.evaluate(() => { stt.allowPermission(); stt.delayPermission = false; });
            await page.waitForTimeout(30); await tracksStopped();
            assert.equal(await page.evaluate(() => stt.sockets.length), count);

            // Stop during handshake still flushes captured audio in the correct order.
            await page.evaluate(() => { stt.holdOpen = true; });
            await mic.click(); await state('starting');
            await mic.click(); await state('stopping'); await tracksStopped();
            await page.evaluate(() => { stt.sockets.at(-1).open(); stt.holdOpen = false; });
            await state('idle');
            assert.deepEqual(await page.evaluate(() => stt.sockets.at(-1).sent.map(x => typeof x === 'string' ? JSON.parse(x).type : 'audio')), ['audio', 'audio', 'CloseStream']);

            // Pointer cancellation and keyboard taps/holds share the same lifecycle.
            await mic.dispatchEvent('pointerdown', { pointerId: 9, button: 0, isPrimary: false });
            await state('idle');
            await mic.focus(); await page.keyboard.press('Space'); await state('listening');
            await page.keyboard.press('Enter'); await state('idle');
            await page.keyboard.down('Space'); await state('listening');
            await page.waitForTimeout(380); await page.keyboard.up('Space'); await state('idle');
            await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down(); await state('listening');
            await mic.dispatchEvent('pointercancel', { pointerId: 1 });
            await page.mouse.up(); await state('idle'); await tracksStopped();
            await mic.tap(); await state('listening');
            await mic.tap(); await state('idle'); await tracksStopped();

            // Sending waits for final transcription, including initially empty input.
            await input.fill(''); await mic.click(); await state('listening');
            await page.evaluate(() => { stt.finalText = 'Final words.'; });
            await page.locator('#btn-send').click();
            await expect(input).toHaveValue('');
            await expect.poll(() => chats.length).toBe(1);
            assert.equal(chats[0].messages.at(-1).content, 'Final words.');
            await page.evaluate(() => { stt.finalText = ''; });
            await state('idle'); await tracksStopped();

            // Editing and settings invalidate late results without overwriting the draft.
            await mic.click(); await state('listening'); await emit('partial');
            await input.fill('My correction'); await state('idle'); await tracksStopped();
            await emit('late text', true); await expect(input).toHaveValue('My correction');
            await mic.click(); await state('listening');
            await settings(); await tracksStopped();
            await page.locator('#setting-deepgram-apikey').fill('discarded');
            await page.locator('#setting-deepgram-model').fill('nova-2');
            await page.locator('#setting-deepgram-enabled').uncheck();
            await page.locator('#btn-cancel-settings').click();
            await expect(mic).toBeEnabled();
            assert.equal(await page.evaluate(() => Settings.get().deepgramApiKey), 'private-deepgram-key');
            assert.equal(await page.evaluate(() => Settings.get().deepgramModel), 'nova-3', 'cancel preserves the saved model');
            await settings(); await page.locator('#setting-deepgram-enabled').uncheck(); await save();
            await expect(mic).toBeDisabled();
            await expect(page.locator('#microphone-controls')).toBeHidden();
            await expect(page.locator('#microphone-status')).toBeHidden();
            await input.fill('');
            // Textarea auto-resizing can round its height down by one pixel.
            assert.ok(Math.abs(await page.locator('#input-area').evaluate(el => el.getBoundingClientRect().height) - compactHeight) <= 1, 'disabled recognition leaves no extra row or gap');
            assert.equal(await page.evaluate(() => Settings.get().deepgramApiKey), 'private-deepgram-key');
            await settings(); await page.locator('#setting-deepgram-enabled').check();
            await page.locator('#setting-deepgram-language').selectOption('multi');
            await page.locator('#settings-tab-speech').click();
            await page.locator('#setting-voicevox-enabled').check(); await save();
            assert.deepEqual(await page.evaluate(() => [Settings.get().deepgramEnabled, Settings.get().voicevoxEnabled]), [true, true]);
            await mic.click(); await state('listening');
            assert.equal(await page.evaluate(() => new URL(stt.sockets.at(-1).url).searchParams.get('language')), 'multi');
            await mic.click(); await state('idle');

            // Editable model IDs survive saving/reload and reach the streaming API.
            await settings();
            await page.locator('#setting-deepgram-model').fill('  nova-2-general  ');
            await page.locator('#setting-deepgram-language').selectOption('en');
            await save(); await page.reload();
            assert.equal(await page.evaluate(() => Settings.get().deepgramModel), 'nova-2-general');
            await settings();
            await expect(page.locator('#setting-deepgram-model')).toHaveValue('nova-2-general');
            await page.locator('#setting-deepgram-enabled').uncheck(); await save();
            await expect(mic).toBeHidden();
            assert.equal(await page.evaluate(() => Settings.get().deepgramModel), 'nova-2-general');
            await settings(); await page.locator('#setting-deepgram-enabled').check(); await save();
            await mic.click(); await state('listening');
            assert.equal(await page.evaluate(() => new URL(stt.sockets.at(-1).url).searchParams.get('model')), 'nova-2-general');
            await mic.click(); await state('idle');
            await settings(); await page.locator('#setting-deepgram-model').fill('   '); await save();
            assert.equal(await page.evaluate(() => Settings.get().deepgramModel), 'nova-3');

            // Permissions, service errors, disconnects, device loss and backpressure.
            await page.evaluate(() => { stt.permissionError = 'NotAllowedError'; });
            await mic.click(); await state('idle');
            await expect(page.locator('#microphone-status')).toContainText(entry.includes('_en') ? 'denied' : '許可');
            await page.evaluate(() => { stt.permissionError = ''; });
            for (const failure of ['error', 'message', 'disconnect', 'device', 'backpressure']) {
                await mic.click(); await state('listening'); await emit('Preserved');
                await page.evaluate(failure => {
                    const ws = stt.sockets.at(-1);
                    if (failure === 'error') ws.onerror();
                    if (failure === 'message') ws.onmessage({ data: '{"type":"Error","description":"private-deepgram-key"}' });
                    if (failure === 'disconnect') ws.close(1006);
                    if (failure === 'device') stt.streams.at(-1).getAudioTracks()[0].onended();
                    if (failure === 'backpressure') { ws.bufferedAmount = 2 * 1024 * 1024; stt.recorders.at(-1).ondataavailable({ data: new Blob(['audio']) }); }
                }, failure);
                await state('idle'); await tracksStopped();
                assert.match(await input.inputValue(), /Preserved/);
                assert.equal((await page.locator('#microphone-status').textContent()).includes('private-deepgram-key'), false);
                await input.fill('');
            }

            // Bounded final-result wait; failed flush does not auto-send a partial draft.
            await mic.click(); await state('listening'); await emit('Unconfirmed');
            await page.evaluate(() => { stt.autoClose = false; });
            await page.clock.install();
            await page.locator('#btn-send').click(); await state('stopping');
            await tracksStopped();
            await page.clock.fastForward(5100); await state('idle'); await tracksStopped();
            assert.equal(chats.length, 1);
            await expect(input).toHaveValue('Unconfirmed');
            await expect(page.locator('#microphone-status')).toContainText(entry.includes('_en') ? 'timed out' : 'タイムアウト');
            await page.clock.resume();
            await page.evaluate(() => { stt.autoClose = true; });

            // Cancelling a pending send by editing must not submit the new draft.
            await mic.click(); await state('listening'); await emit('Speaking');
            await page.evaluate(() => { stt.autoClose = false; });
            await page.locator('#btn-send').click(); await state('stopping');
            await input.fill('Keep editing'); await state('idle');
            await page.waitForTimeout(20);
            assert.equal(chats.length, 1);
            await expect(input).toHaveValue('Keep editing');
            await page.evaluate(() => { stt.autoClose = true; });

            await page.evaluate(() => { stt.delayPermission = true; });
            await mic.click(); await state('starting');
            await page.clock.fastForward(31000); await state('idle');
            await expect(page.locator('#microphone-status')).toContainText(entry.includes('_en') ? 'permission timed out' : '許可待ち');
            await page.evaluate(() => { stt.allowPermission(); stt.delayPermission = false; });
            await page.waitForTimeout(20); await tracksStopped();
            await page.evaluate(() => { stt.holdOpen = true; });
            await mic.click(); await state('starting');
            await page.clock.fastForward(11000); await state('idle'); await tracksStopped();
            await page.evaluate(() => { stt.holdOpen = false; });
            await mic.click(); await state('listening');
            await page.clock.fastForward(4100);
            assert.ok(await page.evaluate(() => stt.sockets.at(-1).sent.some(x => typeof x === 'string' && JSON.parse(x).type === 'KeepAlive')));
            await mic.click(); await state('idle');

            // Backgrounding/page exit cancel sessions; no late recognition changes.
            await mic.click(); await state('listening');
            await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
            await state('idle'); await tracksStopped();

            // Ending a text call hides the composer and terminates its capture.
            await settings();
            await page.locator('#settings-tab-speech').click();
            await page.locator('#setting-voicevox-enabled').uncheck();
            await page.locator('#settings-tab-setup').click();
            await page.locator('#setting-app-mode').selectOption('textCall'); await save();
            await expect(mic).toBeHidden();
            await page.locator('#btn-start-call').click();
            await mic.click(); await state('listening');
            await page.locator('#btn-end-call').click();
            await state('idle'); await tracksStopped(); await expect(mic).toBeHidden();
            await settings(); await page.locator('#settings-tab-setup').click();
            await page.locator('#setting-app-mode').selectOption('chat'); await save();

            // Same button dimensions and viewport centering, including an intent badge.
            for (const width of [320, 390, 1200]) {
                await page.setViewportSize({ width, height: 844 });
                await page.evaluate(() => { const badge = document.getElementById('intent-badge'); badge.classList.remove('hidden'); badge.textContent = 'Intent'; });
                const rects = await page.evaluate(() => {
                    const rect = id => { const { x, y, width, height } = document.getElementById(id).getBoundingClientRect(); return { x, y, width, height }; };
                    return { mic: rect('btn-microphone'), send: rect('btn-send'), input: rect('user-input'), body: document.body.scrollWidth };
                });
                assert.equal(rects.mic.width, rects.send.width); assert.equal(rects.mic.height, rects.send.height);
                assert.ok(Math.abs(rects.mic.x + rects.mic.width / 2 - width / 2) < 1);
                assert.ok(rects.mic.y + rects.mic.height < rects.input.y);
                assert.ok(rects.input.width > 0 && rects.body <= width);
            }
            if (process.env.SLOWDIALOG_SCREENSHOT_DIR && entry === 'index.html') {
                await page.setViewportSize({ width: 390, height: 844 });
                await input.fill('音声で入力した内容を確認して送信できます。');
                await page.screenshot({ path: path.join(process.env.SLOWDIALOG_SCREENSHOT_DIR, 'voice-input-mobile.png') });
                await settings();
                await page.screenshot({ path: path.join(process.env.SLOWDIALOG_SCREENSHOT_DIR, 'voice-input-settings.png') });
            }
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`PASS ${entry}: settings, streaming, PTT, cancellation, finalization, failures, layout`);
        }

        // Exercise native browser capture, MediaRecorder and WebSocket with a
        // synthetic microphone and localhost peer. Playwright routeWebSocket's
        // Blob conversion is asynchronous and can reorder Blob/text messages, so
        // use a real socket here to verify audio/CloseStream wire ordering.
        const context = await browser.newContext();
        const page = await context.newPage();
        const errors = [], frames = [];
        page.on('pageerror', error => errors.push(error.message));
        localPeer = new WebSocketServer({ host: '127.0.0.1', port: 0 });
        await new Promise(resolve => localPeer.once('listening', resolve));
        localPeer.on('connection', ws => {
            ws.on('message', (data, binary) => {
                frames.push(binary ? data : data.toString());
                if (binary) ws.send(JSON.stringify({ type: 'Results', is_final: false, channel: { alternatives: [{ transcript: 'Real recording' }] } }));
                else if (JSON.parse(data.toString()).type === 'CloseStream') {
                    ws.send(JSON.stringify({ type: 'Results', is_final: true, start: 0, duration: 1, channel: { alternatives: [{ transcript: 'Real recording.' }] } }));
                    ws.close(1000);
                }
            });
        });
        await page.addInitScript(port => {
            localStorage.setItem('slowdialog_intro_seen', '1');
            localStorage.setItem('slowdialog_settings', JSON.stringify({ apiKey: 'chat', deepgramEnabled: true, deepgramApiKey: 'fake', soundEnabled: false }));
            const NativeWebSocket = window.WebSocket;
            window.WebSocket = class extends NativeWebSocket {
                constructor(url, protocols) { super(`ws://127.0.0.1:${port}`, protocols); }
            };
            const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async options => {
                const stream = await capture(options);
                window.captureTracks = stream.getTracks();
                return stream;
            };
        }, localPeer.address().port);
        await page.goto(pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
        await page.locator('#btn-microphone').click();
        await expect(page.locator('#user-input')).toHaveValue('Real recording');
        await page.locator('#btn-microphone').click();
        await expect(page.locator('#btn-microphone')).toHaveAttribute('data-state', 'idle');
        await expect(page.locator('#user-input')).toHaveValue('Real recording.');
        assert.ok(await page.evaluate(() => captureTracks.every(track => track.readyState === 'ended')));
        const audio = frames.filter(Buffer.isBuffer);
        assert.ok(audio.length >= 2, 'native recorder flushes its final audio chunk');
        assert.equal(audio[0].subarray(0, 4).toString('hex'), '1a45dfa3', 'WebM container header');
        assert.equal(JSON.parse(frames.at(-1)).type, 'CloseStream');
        assert.deepEqual(errors, []);
        await context.close();
        console.log('PASS native MediaRecorder + WebSocket: synthetic microphone, WebM audio, final flush, track cleanup');
    } finally {
        if (localPeer) {
            for (const client of localPeer.clients) client.terminate();
            await new Promise(resolve => localPeer.close(resolve));
        }
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
