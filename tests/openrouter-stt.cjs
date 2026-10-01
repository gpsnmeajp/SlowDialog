// OpenRouter STT: browser UI, complete audio uploads, cancellation and native capture.
// All API requests are intercepted; synthetic audio only, no paid requests.
const { chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function mocks() {
    localStorage.setItem('slowdialog_intro_seen', '1');
    if (!localStorage.getItem('slowdialog_settings')) localStorage.setItem('slowdialog_settings', JSON.stringify({
        apiKey: 'chat-key', baseUrl: 'https://chat.test/v1', soundEnabled: false, charDelayMs: 0, minDelaySec: 0,
        deepgramEnabled: true, deepgramApiKey: 'deepgram-key', deepgramModel: 'nova-2',
        openrouterTtsApiKey: 'tts-key',
    }));
    const stt = window.stt = { streams: [], recorders: [], mime: 'audio/webm;codecs=opus' };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
        if (stt.permissionError) throw new DOMException('Denied', stt.permissionError);
        if (stt.delayPermission) await new Promise(resolve => { stt.allow = resolve; });
        const track = { stopped: false, stop() { this.stopped = true; } };
        const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
        stt.streams.push(stream);
        return stream;
    } });
    window.MediaRecorder = class {
        static isTypeSupported(type) { return type === stt.mime; }
        constructor(stream) { this.stream = stream; this.mimeType = stt.mime; this.state = 'inactive'; stt.recorders.push(this); }
        start() { this.state = 'recording'; this.ondataavailable?.({ data: new Blob(['HEADER\x00\xff'], { type: this.mimeType }) }); }
        stop() {
            this.state = 'inactive';
            setTimeout(() => {
                this.ondataavailable?.({ data: new Blob(['TAIL'], { type: this.mimeType }) });
                this.onstop?.();
            }, 0);
        }
    };
    window.WebSocket = class { constructor() { throw new Error('OpenRouter must not use Deepgram WebSocket'); } };
}

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true,
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    try {
        for (const entry of ['index.html', 'index_en.html', 'dist/index.html', 'dist/index_en.html']) {
            const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
            const page = await context.newPage();
            const errors = [], requests = [], chats = [];
            let response = { text: 'Recognized words.' }, status = 200, networkError = false, delayed = false, release;
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(mocks);
            await page.route('**/audio/transcriptions', async route => {
                requests.push({ url: route.request().url(), headers: route.request().headers(), body: route.request().postDataJSON() });
                if (delayed) await new Promise(resolve => { release = resolve; });
                if (networkError) await route.abort();
                else await route.fulfill({ status, contentType: 'application/json', body: typeof response === 'string' ? response : JSON.stringify(response) }).catch(() => {});
            });
            await page.route('**/chat/completions', async route => {
                chats.push(route.request().postDataJSON());
                await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"OK."}}]}\n\ndata: [DONE]\n\n' });
            });
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
            const mic = page.locator('#btn-microphone'), input = page.locator('#user-input');
            const state = value => expect(mic).toHaveAttribute('data-state', value);
            const settings = async () => { await page.locator('#btn-settings').click(); await page.locator('#settings-tab-recognition').click(); };
            const save = async () => { await page.locator('#btn-save-settings').click(); await expect(page.locator('#settings-overlay')).toBeHidden(); };
            const stopped = async () => assert.ok(await page.evaluate(() => stt.streams.every(stream => stream.getTracks().every(track => track.stopped))));
            await settings();
            await expect(page.locator('#setting-openrouter-stt-enabled')).not.toBeChecked();
            await page.locator('#setting-openrouter-stt-enabled').check();
            await expect(page.locator('#setting-deepgram-enabled')).not.toBeChecked();
            await expect(page.locator('#deepgram-settings')).toBeHidden();
            await expect(page.locator('#setting-openrouter-stt-model')).toHaveValue('openai/whisper-1');
            await expect(page.locator('#setting-openrouter-stt-language')).toHaveValue(entry.includes('_en') ? 'en' : 'ja');
            await save();
            await mic.click(); await state('idle');
            await expect(page.locator('#microphone-status')).toContainText('OpenRouter API');
            assert.equal(await page.evaluate(() => stt.streams.length), 0);
            await settings();
            await page.locator('#setting-openrouter-stt-baseurl').fill('https://stt.test/v1///');
            await page.locator('#setting-openrouter-stt-apikey').fill('  stt-key  ');
            await page.locator('#setting-openrouter-stt-model').fill('  openai/gpt-4o-transcribe  ');
            await save(); await page.reload();
            assert.deepEqual(await page.evaluate(() => [Settings.get().openrouterSttApiKey, Settings.get().openrouterSttModel, Settings.get().deepgramEnabled]), ['stt-key', 'openai/gpt-4o-transcribe', false]);

            // A complete clip (including the final chunk) is uploaded only at stop.
            await input.fill('Draft'); await mic.click(); await state('listening');
            assert.equal(requests.length, 0); await expect(input).toHaveValue('Draft');
            await expect(page.locator('#microphone-status')).toContainText(entry.includes('_en') ? 'Recording' : '録音中');
            await mic.click(); await state('idle'); await stopped();
            await expect(input).toHaveValue('Draft Recognized words.');
            assert.equal(requests.length, 1); assert.equal(chats.length, 0);
            assert.equal(requests[0].url, 'https://stt.test/v1/audio/transcriptions');
            assert.equal(requests[0].headers.authorization, 'Bearer stt-key');
            assert.deepEqual(requests[0].body, { model: 'openai/gpt-4o-transcribe', response_format: 'json',
                language: entry.includes('_en') ? 'en' : 'ja', input_audio: { format: 'webm', data: Buffer.from('HEADER\x00\xffTAIL').toString('base64') } });

            // PTT and keyboard share the control, without submitting the chat.
            await input.fill(''); response = { text: 'こんにちは。' };
            const box = await mic.boundingBox();
            await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down(); await state('listening');
            await page.waitForTimeout(380); await page.mouse.move(5, 5); await page.mouse.up();
            await state('idle'); await stopped(); await expect(input).toHaveValue('こんにちは。');
            await mic.focus(); await page.keyboard.press('Space'); await state('listening');
            await page.keyboard.press('Enter'); await state('idle'); await stopped();

            // Send stops capture immediately and waits for transcription, even
            // with an initially empty input. Repeated sends must not duplicate it.
            await input.fill(''); delayed = true; response = { text: 'Send these words.' };
            await mic.tap(); await state('listening'); await page.locator('#btn-send').click();
            await state('stopping'); await stopped();
            await expect.poll(() => !!release).toBe(true);
            await page.locator('#btn-send').click(); assert.equal(chats.length, 0);
            release(); release = null; delayed = false;
            await state('idle'); await expect.poll(() => chats.length).toBe(1);
            assert.equal(chats[0].messages.at(-1).content, 'Send these words.');
            await expect(input).toHaveValue('');

            // Manual edits cancel a pending request and the pending chat send.
            delayed = true; response = { text: 'Must not overwrite' };
            await mic.click(); await state('listening'); await page.locator('#btn-send').click(); await state('stopping');
            await expect.poll(() => !!release).toBe(true);
            await input.fill('My edit'); await state('idle');
            release(); release = null; delayed = false; await page.waitForTimeout(30);
            await expect(input).toHaveValue('My edit'); assert.equal(chats.length, 1); await stopped();
            const requestCount = requests.length;
            await mic.click(); await state('listening'); await settings(); await stopped();
            assert.equal(requests.length, requestCount, 'opening settings discards unfinished recording');
            await page.locator('#setting-openrouter-stt-apikey').fill('discarded');
            await page.locator('#setting-openrouter-stt-model').fill('discarded');
            await page.locator('#setting-deepgram-enabled').check();
            await expect(page.locator('#setting-openrouter-stt-enabled')).not.toBeChecked();
            await page.locator('#btn-cancel-settings').click();
            assert.equal(await page.evaluate(() => Settings.get().openrouterSttEnabled), true);
            assert.equal(await page.evaluate(() => Settings.get().openrouterSttApiKey), 'stt-key');

            // Provider switching keeps both configurations; TTS is independent.
            await settings(); await page.locator('#setting-deepgram-enabled').check(); await save();
            assert.deepEqual(await page.evaluate(() => [Settings.get().deepgramEnabled, Settings.get().openrouterSttEnabled, Settings.get().deepgramApiKey, Settings.get().openrouterSttModel]), [true, false, 'deepgram-key', 'openai/gpt-4o-transcribe']);
            await settings(); await page.locator('#setting-openrouter-stt-enabled').check();
            await page.locator('#setting-openrouter-stt-language').selectOption('');
            await page.locator('#settings-tab-speech').click(); await page.locator('#setting-openrouter-tts-enabled').check(); await save();
            assert.equal(await page.evaluate(() => Settings.get().openrouterTtsEnabled), true);
            await input.fill(''); response = { text: '' };
            await mic.click(); await state('listening'); await mic.click(); await state('idle');
            assert.equal('language' in requests.at(-1).body, false, 'auto language omits the hint');
            await expect(input).toHaveValue('');
            await settings(); await page.locator('#setting-openrouter-stt-enabled').uncheck(); await save();
            await expect(mic).toBeHidden();
            assert.equal(await page.evaluate(() => Settings.get().openrouterSttApiKey), 'stt-key');
            await settings(); await page.locator('#setting-openrouter-stt-enabled').check();
            await page.locator('#setting-openrouter-stt-model').fill(''); await page.locator('#setting-openrouter-stt-baseurl').fill(''); await save();
            assert.equal(await page.evaluate(() => Settings.get().openrouterSttModel), 'openai/whisper-1');

            // Actual recorder MIME determines the API format; no relabeling audio.
            for (const [mime, format] of [['audio/ogg;codecs=opus', 'ogg'], ['audio/mp4', 'm4a']]) {
                await page.evaluate(mime => { stt.mime = mime; }, mime);
                await mic.click(); await state('listening'); await mic.click(); await state('idle');
                assert.equal(requests.at(-1).body.input_audio.format, format);
                assert.equal(requests.at(-1).url, 'https://openrouter.ai/api/v1/audio/transcriptions');
            }
            await page.evaluate(() => { stt.mime = 'audio/webm;codecs=opus'; });

            // Errors preserve existing drafts and release audio capture.
            for (const failure of ['http', 'json', 'shape', 'network']) {
                await input.fill('Keep this draft');
                status = failure === 'http' ? 401 : 200;
                response = failure === 'json' ? 'invalid JSON' : { error: { message: 'stt-key' } };
                networkError = failure === 'network';
                await mic.click(); await state('listening'); await mic.click(); await state('idle'); await stopped();
                await expect(input).toHaveValue('Keep this draft');
                const error = await page.locator('#microphone-status').textContent();
                assert.ok(error.includes('OpenRouter')); assert.ok(!error.includes('stt-key'));
                if (failure === 'http') assert.ok(error.includes('(401)'));
            }
            status = 200; networkError = false; response = { text: 'Late' };
            await page.evaluate(() => { stt.permissionError = 'NotAllowedError'; });
            await mic.click(); await state('idle');
            await expect(page.locator('#microphone-status')).toContainText(entry.includes('_en') ? 'denied' : '許可');
            await page.evaluate(() => { stt.permissionError = ''; stt.delayPermission = true; });
            await mic.click(); await state('starting'); await mic.click(); await state('idle');
            const before = requests.length;
            await page.evaluate(() => { stt.allow(); stt.delayPermission = false; });
            await page.waitForTimeout(20); await stopped(); assert.equal(requests.length, before);

            // Timeout aborts the request; later response cannot edit or send.
            await mic.click(); await state('listening'); delayed = true;
            await page.clock.install(); await page.locator('#btn-send').click(); await state('stopping');
            await expect.poll(() => !!release).toBe(true);
            await page.clock.fastForward(66000); await state('idle'); await stopped();
            await expect(page.locator('#microphone-status')).toContainText(entry.includes('_en') ? 'timed out' : 'タイムアウト');
            release(); release = null; delayed = false;
            await expect(input).toHaveValue('Keep this draft'); assert.equal(chats.length, 1);
            await page.clock.resume();

            await mic.click(); await state('listening');
            await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
            await state('idle'); await stopped();
            if (process.env.SLOWDIALOG_SCREENSHOT_DIR && entry === 'index.html') {
                await settings();
                await page.screenshot({ path: path.join(process.env.SLOWDIALOG_SCREENSHOT_DIR, 'openrouter-stt-settings.png') });
                await page.locator('#btn-cancel-settings').click();
            }
            // Conflicting saved flags normalize predictably on reload.
            await page.evaluate(() => localStorage.setItem('slowdialog_settings', JSON.stringify({ ...Settings.get(), deepgramEnabled: true, openrouterSttEnabled: true })));
            await page.reload();
            assert.deepEqual(await page.evaluate(() => [Settings.get().deepgramEnabled, Settings.get().openrouterSttEnabled]), [false, true]);
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`PASS ${entry}: OpenRouter STT settings, audio contract, PTT, send, cancellation, errors`);
        }

        // Native MediaRecorder generates a real, complete WebM clip.
        const context = await browser.newContext();
        const page = await context.newPage();
        let body;
        await page.addInitScript(() => {
            localStorage.setItem('slowdialog_intro_seen', '1');
            localStorage.setItem('slowdialog_settings', JSON.stringify({ apiKey: 'chat', openrouterSttEnabled: true, openrouterSttApiKey: 'fake', soundEnabled: false }));
            const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async options => {
                const stream = await capture(options); window.tracks = stream.getTracks(); return stream;
            };
        });
        await page.route('**/audio/transcriptions', async route => {
            body = route.request().postDataJSON();
            await route.fulfill({ contentType: 'application/json', body: '{"text":"Native recording."}' });
        });
        await page.goto(pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href);
        await page.locator('#btn-microphone').click();
        await expect(page.locator('#btn-microphone')).toHaveAttribute('data-state', 'listening');
        await page.waitForTimeout(450);
        assert.equal(body, undefined);
        await page.locator('#btn-microphone').click();
        await expect(page.locator('#user-input')).toHaveValue('Native recording.');
        assert.ok(await page.evaluate(() => tracks.every(track => track.readyState === 'ended')));
        const audio = Buffer.from(body.input_audio.data, 'base64');
        assert.equal(body.input_audio.format, 'webm');
        assert.equal(audio.subarray(0, 4).toString('hex'), '1a45dfa3');
        assert.ok(audio.length > 100);
        await context.close();
        console.log('PASS native OpenRouter STT capture: complete WebM/base64 payload and microphone release');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
