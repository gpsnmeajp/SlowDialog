// Run with Node.js + Playwright and installed Edge. No paid API calls are made.
const { chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// 0.1 seconds of 24 kHz, signed 16-bit mono PCM, including both sample extremes.
const pcm = Buffer.alloc(4800);
pcm.writeInt16LE(-32768, 0);
pcm.writeInt16LE(32767, 4);

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const entry of ['index.html', 'index_en.html', 'dist/index.html', 'dist/index_en.html']) {
            const ja = !entry.includes('_en');
            const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
            const page = await context.newPage();
            const errors = [], requests = [], speeches = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => {
                localStorage.setItem('slowdialog_intro_seen', '1');
                if (!localStorage.getItem('slowdialog_settings')) localStorage.setItem('slowdialog_settings', JSON.stringify({
                    apiKey: 'chat-key', baseUrl: 'https://chat.test/v1', soundEnabled: false,
                    voicevoxEnabled: true, voicevoxSpeaker: 7,
                    irodoriVoice: 'saved-voice', charDelayMs: 0, minDelaySec: 0,
                }));
                window.playedAudio = [];
                window.autoEndAudio = true;
                window.createdUrls = [];
                window.audioBlobs = [];
                window.revokedUrls = [];
                const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
                URL.createObjectURL = blob => { const url = create(blob); window.createdUrls.push(url); window.audioBlobs.push(blob); return url; };
                URL.revokeObjectURL = url => { window.revokedUrls.push(url); revoke(url); };
                window.Audio = class extends EventTarget {
                    constructor(url) { super(); this.url = url; }
                    play() {
                        window.playedAudio.push(this);
                        if (window.autoEndAudio) setTimeout(() => this.dispatchEvent(new Event('ended')), 0);
                        return Promise.resolve();
                    }
                };
            });
            let failureStatus = 0, networkError = false, speechGate = null;
            let audioType = null, audioBody = null;
            await page.route(/^https:\/\/(?:openrouter\.ai\/api\/v1|tts\.test)\//, async route => {
                const req = route.request();
                requests.push({ url: req.url(), method: req.method(), headers: req.headers() });
                if (networkError) return route.abort('failed');
                if (req.url().endsWith('/audio/speech')) {
                    speeches.push(req.postDataJSON());
                    if (speechGate) { const gate = speechGate; speechGate = null; await gate; }
                    const raw = req.postDataJSON().response_format === 'pcm';
                    return route.fulfill({ status: failureStatus || 200,
                        contentType: audioType ?? (raw ? 'audio/pcm' : 'audio/mpeg'),
                        body: audioBody ?? (raw ? pcm : Buffer.from('mock MP3 bytes')) });
                }
                await route.fulfill({ status: 404, body: 'Unexpected endpoint' });
            });
            let reply = '最初（補足。続き）です。次の文章。';
            await page.route('https://chat.test/**', route => route.fulfill({ contentType: 'text/event-stream',
                body: 'data: ' + JSON.stringify({ choices: [{ delta: { content: reply } }] }) + '\n\ndata: [DONE]\n\n' }));
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
            const open = async () => {
                await page.locator('#btn-settings').click();
                await page.locator('#settings-tab-speech').click();
            };
            await open();
            const enabled = page.locator('#setting-openrouter-tts-enabled');
            const status = page.locator('#openrouter-tts-status');
            const baseUrl = page.locator('#setting-openrouter-tts-baseurl');
            const model = page.locator('#setting-openrouter-tts-model');
            const voice = page.locator('#setting-openrouter-tts-voice');
            const format = page.locator('#setting-openrouter-tts-format');
            const speak = page.locator('#btn-openrouter-tts-speak-test');
            const ok = ja ? '発話テストを再生しました。' : 'Test speech played.';
            const failed = ja ? '発話テストに失敗しました。' : 'Test speech failed.';
            await expect(enabled).not.toBeChecked();
            await expect(page.locator('#setting-voicevox-enabled')).toBeChecked();
            await enabled.check();
            await expect(page.locator('#setting-voicevox-enabled')).not.toBeChecked();
            await expect(page.locator('#voicevox-settings')).toBeHidden();
            await expect(page.locator('#openrouter-tts-settings')).toBeVisible();
            await expect(baseUrl).toHaveValue('https://openrouter.ai/api/v1');
            await expect(model).toHaveValue('google/gemini-3.8-flash-tts');
            await expect(voice).toHaveValue('Zephyr');
            await expect(format, 'existing settings without a format use PCM').toHaveValue('pcm');
            assert.deepEqual(await format.locator('option').evaluateAll(options => options.map(option => option.value)), ['pcm', 'mp3']);
            await expect(page.locator('#btn-openrouter-tts-load-models, #openrouter-tts-models')).toHaveCount(0);
            assert.equal(await model.getAttribute('list'), null, 'model selection is manual only');
            await speak.click();
            await expect(status).toHaveText(ja ? 'OpenRouterのAPIキーを入力してください。' : 'Enter your OpenRouter API key.');
            assert.equal(requests.length, 0, 'missing TTS key never uses the chat key');
            await page.locator('#setting-openrouter-tts-apikey').fill(' tts-key ');
            await speak.click();
            await expect(status).toHaveText(ok);
            assert.equal(requests.at(-1).url, 'https://openrouter.ai/api/v1/audio/speech');
            assert.equal(speeches.at(-1).model, 'google/gemini-3.8-flash-tts');
            assert.equal(speeches.at(-1).voice, 'Zephyr');
            assert.equal(speeches.at(-1).response_format, 'pcm');
            const decoded = await page.evaluate(async () => {
                const blob = window.audioBlobs.at(-1);
                const bytes = await blob.arrayBuffer();
                const view = new DataView(bytes);
                const audio = await new OfflineAudioContext(1, 1, 24000).decodeAudioData(bytes.slice(0));
                // Exercise the real HTML audio metadata path as well as Web Audio decoding.
                const url = URL.createObjectURL(blob);
                const player = document.createElement('audio');
                let timer;
                try {
                    const duration = await new Promise((resolve, reject) => {
                        timer = setTimeout(() => reject(new Error('Audio metadata timeout')), 3000);
                        player.onloadedmetadata = () => resolve(player.duration);
                        player.onerror = () => reject(new Error('WAV playback failed'));
                        player.src = url;
                        player.load();
                    });
                    return { type: blob.type, size: blob.size, sampleRate: audio.sampleRate, channels: audio.numberOfChannels,
                        frames: audio.length, duration, samples: Array.from(audio.getChannelData(0).slice(0, 3)),
                        dataSize: view.getUint32(40, true), payload: Array.from(new Uint8Array(bytes, 44)) };
                } finally { clearTimeout(timer); URL.revokeObjectURL(url); player.removeAttribute('src'); player.load(); }
            });
            assert.equal(decoded.type, 'audio/wav');
            assert.equal(decoded.size, 44 + pcm.length);
            assert.equal(decoded.dataSize, pcm.length);
            assert.equal(decoded.sampleRate, 24000);
            assert.equal(decoded.channels, 1);
            assert.equal(decoded.frames, 2400);
            assert.ok(Math.abs(decoded.duration - 0.1) < 0.001);
            assert.deepEqual(decoded.samples.slice(0, 2), [-1, 0]);
            // Decoders may normalize the positive signed-16 maximum to exactly 1.
            assert.ok(Math.abs(decoded.samples[2] - 32767 / 32768) <= 1 / 32768);
            assert.deepEqual(Buffer.from(decoded.payload), pcm, 'WAV wrapping preserves every PCM sample');
            await baseUrl.fill('');
            await model.fill('');
            await voice.fill('');
            await speak.click();
            await expect(status).toHaveText(ok);
            assert.equal(requests.at(-1).url, 'https://openrouter.ai/api/v1/audio/speech');
            assert.equal(speeches.at(-1).model, 'google/gemini-3.8-flash-tts');
            assert.equal(speeches.at(-1).voice, 'Zephyr');
            assert.equal(speeches.at(-1).response_format, 'pcm');
            const customStart = requests.length;
            await baseUrl.fill('https://tts.test/proxy/v1///');
            await model.fill(' provider/custom-tts ');
            await format.selectOption('mp3');
            await voice.fill(' custom-voice ');
            await page.locator('#setting-openrouter-tts-speed').fill('1.25');
            const ruby = '｜漢字《かんじ》（補足）です。';
            await page.locator('#setting-openrouter-tts-test-text').fill(ruby);
            await speak.click();
            await expect(status).toHaveText(ok);
            assert.equal(requests.at(-1).headers.authorization, 'Bearer tts-key');
            assert.equal(requests.at(-1).method, 'POST');
            assert.equal(requests.at(-1).url, 'https://tts.test/proxy/v1/audio/speech', 'trailing slashes are removed and path prefixes are preserved');
            assert.deepEqual(speeches.at(-1), { model: 'provider/custom-tts', input: '漢字です。', voice: 'custom-voice',
                response_format: 'mp3', speed: 1.25 });
            assert.deepEqual(await page.evaluate(async () => {
                const blob = window.audioBlobs.at(-1);
                return { type: blob.type, text: await blob.text() };
            }), { type: 'audio/mpeg', text: 'mock MP3 bytes' }, 'MP3 is passed through without WAV wrapping');
            assert.equal(await page.evaluate(() => Settings.get().openrouterTtsEnabled), false, 'tests use unsaved form settings');
            assert.equal(await page.evaluate(() => Settings.get().openrouterTtsBaseUrl), 'https://openrouter.ai/api/v1');
            await baseUrl.fill('https://tts.test/proxy/v1');
            await page.locator('#setting-openrouter-tts-skip-annotations').uncheck();
            await speak.click();
            await expect(status).toHaveText(ok);
            assert.equal(speeches.at(-1).input, ruby);
            await page.locator('#setting-openrouter-tts-skip-annotations').check();
            failureStatus = 429;
            await speak.click();
            await expect(status).toHaveText(failed + '(429)');
            failureStatus = 0;
            networkError = true;
            await speak.click();
            await expect(status).toHaveText(failed + '(Failed t)');
            networkError = false;
            const playsBefore = await page.evaluate(() => window.playedAudio.length);
            audioType = 'application/json';
            await speak.click();
            await expect(status).toHaveText(failed + '(Invalid )');
            audioType = 'audio/mpeg'; audioBody = Buffer.alloc(0);
            await speak.click();
            await expect(status).toHaveText(failed + '(Empty au)');
            assert.equal(await page.evaluate(() => window.playedAudio.length), playsBefore);
            audioType = null; audioBody = null;
            await page.locator('#btn-save-settings').click();
            await expect(page.locator('#settings-overlay')).toBeHidden();
            await page.reload();
            await open();
            await expect(enabled).toBeChecked();
            await expect(baseUrl).toHaveValue('https://tts.test/proxy/v1');
            await expect(model).toHaveValue('provider/custom-tts');
            await expect(voice).toHaveValue('custom-voice');
            await expect(format).toHaveValue('mp3');
            await format.selectOption('pcm');
            await page.locator('#btn-cancel-settings').click();
            await open();
            await expect(format, 'cancel preserves the saved format').toHaveValue('mp3');
            await format.selectOption('pcm');
            // Malformed raw audio never creates a playable URL.
            const urlsBefore = await page.evaluate(() => window.createdUrls.length);
            audioBody = Buffer.from([0]);
            await speak.click();
            await expect(status).toHaveText(failed + '(Invalid )');
            assert.equal(await page.evaluate(() => window.createdUrls.length), urlsBefore);
            audioBody = null;
            audioType = 'application/octet-stream';
            await speak.click();
            await expect(status).toHaveText(ok);
            assert.equal(await page.evaluate(() => window.audioBlobs.at(-1).type), 'audio/wav');
            audioType = 'audio/L16;rate=24000';
            await speak.click();
            await expect(status).toHaveText(ok);
            assert.equal(await page.evaluate(() => window.audioBlobs.at(-1).type), 'audio/wav');
            audioType = null;
            await page.locator('#btn-save-settings').click();
            await expect(page.locator('#settings-overlay')).toBeHidden();
            await page.reload();
            await open();
            await expect(format).toHaveValue('pcm');
            await expect(page.locator('#setting-openrouter-tts-apikey')).toHaveValue('tts-key');
            await baseUrl.fill('https://tts.test/cancelled/v1');
            await page.locator('#setting-irodori-enabled').check();
            await expect(enabled).not.toBeChecked();
            await expect(page.locator('#openrouter-tts-settings')).toBeHidden();
            await expect(page.locator('#setting-irodori-voice')).toHaveValue('saved-voice');
            await enabled.check();
            await expect(page.locator('#setting-irodori-enabled')).not.toBeChecked();
            await page.locator('#setting-voicevox-enabled').check();
            await expect(enabled).not.toBeChecked();
            await expect(page.locator('#setting-voicevox-speaker')).toHaveValue('7');
            await page.locator('#btn-cancel-settings').click();
            assert.equal(await page.evaluate(() => Settings.get().openrouterTtsEnabled), true);
            assert.equal(await page.evaluate(() => Settings.get().openrouterTtsBaseUrl), 'https://tts.test/proxy/v1');
            const before = speeches.length;
            assert.equal(await page.evaluate(() => SpeechClient.synthesize('（補足）')), null);
            assert.equal(speeches.length, before);
            await page.evaluate(() => { window.autoEndAudio = false; Settings.save({ ...Settings.get(), charDelayMs: 0, minDelaySec: 0 }); });
            let release;
            speechGate = new Promise(resolve => { release = resolve; });
            await page.locator('#user-input').fill('話してください');
            await page.locator('#btn-send').click();
            await expect.poll(() => speeches.length).toBe(before + 1);
            await expect(page.locator('.msg.assistant')).toHaveCount(0);
            release();
            await expect(page.locator('.msg.assistant')).toHaveCount(1);
            assert.equal(speeches[before].input, '最初です。');
            assert.equal(speeches[before].response_format, 'pcm');
            await page.waitForTimeout(100);
            await expect(page.locator('.msg.assistant')).toHaveCount(1);
            await page.evaluate(() => window.playedAudio.at(-1).dispatchEvent(new Event('ended')));
            await expect(page.locator('.msg.assistant')).toHaveCount(2);
            assert.equal(speeches[before + 1].input, '次の文章。');
            await page.evaluate(() => window.playedAudio.at(-1).dispatchEvent(new Event('ended')));
            await page.reload();
            await expect(page.locator('.msg.assistant')).toHaveCount(2);
            assert.equal(speeches.length, before + 2, 'history reload does not synthesize again');
            failureStatus = 402;
            reply = '音声なしでも表示。';
            await page.locator('#user-input').fill('もう一度');
            await page.locator('#btn-send').click();
            await expect(page.locator('.msg.assistant').last()).toHaveText(reply);
            failureStatus = 0;
            const playedBefore = await page.evaluate(() => window.playedAudio.length);
            reply = '破棄する返答。';
            speechGate = new Promise(resolve => { release = resolve; });
            const pendingCount = speeches.length;
            await page.locator('#user-input').fill('古い質問');
            await page.locator('#btn-send').click();
            await expect.poll(() => speeches.length).toBe(pendingCount + 1);
            reply = '新しい返答。';
            await page.locator('#user-input').fill('新しい質問');
            await page.locator('#btn-send').click();
            await expect(page.locator('.msg.assistant').last()).toHaveText(reply);
            release();
            await expect.poll(() => page.evaluate(() => window.createdUrls.every(url => window.revokedUrls.includes(url)))).toBe(true);
            assert.equal(await page.evaluate(() => window.playedAudio.length), playedBefore + 1);
            assert.equal(await page.locator('.msg.assistant').filter({ hasText: '破棄する返答' }).count(), 0);
            await page.evaluate(() => Settings.save({ ...Settings.get(), openrouterTtsEnabled: false }));
            assert.equal(await page.evaluate(() => SpeechClient.synthesize('無効')), null);
            await page.evaluate(() => {
                Settings.save({ ...Settings.get(), openrouterTtsEnabled: true, voicevoxEnabled: true, irodoriEnabled: true });
            });
            assert.deepEqual(await page.evaluate(() => [Settings.get().voicevoxEnabled, Settings.get().irodoriEnabled]), [false, false]);
            assert.deepEqual(errors, []);
            assert.ok(requests.every(request => request.method === 'POST' && request.url.endsWith('/audio/speech')), 'no model discovery requests');
            assert.ok(requests.slice(customStart).every(request => request.url === 'https://tts.test/proxy/v1/audio/speech'), 'saved Base URL is used for chat and speech tests');
            console.log('PASS ' + entry + ': OpenRouter TTS PCM/MP3, real WAV decoding, settings, API/auth, errors, synchronization, interruption');
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
