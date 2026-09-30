// Run with Node.js + Playwright and installed Edge. No live model server is needed.
const { chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Small real WAV files exercise browser decoding, including unsigned PCM silence.
function makeWave({ channels = 1, bits = 16, float = false, sample = () => 0 } = {}) {
    const frames = 4410, bytes = bits / 8, size = frames * channels * bytes;
    const wav = Buffer.alloc(44 + size);
    wav.write('RIFF'); wav.writeUInt32LE(36 + size, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(float ? 3 : 1, 20);
    wav.writeUInt16LE(channels, 22); wav.writeUInt32LE(44100, 24);
    wav.writeUInt32LE(44100 * channels * bytes, 28); wav.writeUInt16LE(channels * bytes, 32);
    wav.writeUInt16LE(bits, 34); wav.write('data', 36); wav.writeUInt32LE(size, 40);
    for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < channels; channel++) {
        const value = sample(frame, channel), offset = 44 + (frame * channels + channel) * bytes;
        if (float) wav.writeFloatLE(value, offset);
        else if (bits === 8) wav.writeUInt8(value + 128, offset);
        else wav.writeInt16LE(value, offset);
    }
    return wav;
}

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        for (const entry of ['index.html', 'index_en.html', 'dist/index.html', 'dist/index_en.html']) {
            const ja = !entry.includes('_en');
            const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
            const page = await context.newPage();
            const errors = [], requests = [], speeches = [], voicevox = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => {
                localStorage.setItem('slowdialog_intro_seen', '1');
                if (!localStorage.getItem('slowdialog_settings')) localStorage.setItem('slowdialog_settings', JSON.stringify({
                    apiKey: 'chat-key', baseUrl: 'https://chat.test/v1', soundEnabled: false,
                    voicevoxEnabled: true, voicevoxUrl: 'https://voicevox.test', voicevoxSpeaker: 7,
                    charDelayMs: 0, minDelaySec: 0,
                }));
                window.playedAudio = [];
                window.autoEndAudio = true;
                window.createdUrls = [];
                window.revokedUrls = [];
                const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
                URL.createObjectURL = blob => { const url = create(blob); window.createdUrls.push(url); return url; };
                URL.revokeObjectURL = url => { window.revokedUrls.push(url); revoke(url); };
                window.Audio = class extends EventTarget {
                    constructor(url) { super(); this.url = url; this.duration = 1; this.readyState = 1; }
                    play() {
                        window.playedAudio.push(this);
                        if (window.autoEndAudio) setTimeout(() => this.dispatchEvent(new Event('ended')), 5);
                        return Promise.resolve();
                    }
                };
            });
            let failureStatus = 0, malformedVoices = false, speechGate = null;
            let speechResponses = [];
            const silentWav = makeWave();
            const wav = fs.readFileSync(path.resolve(__dirname, '../sound/assistant.wav'));
            await page.route('https://irodori.test/**', async route => {
                const req = route.request();
                requests.push({ url: req.url(), method: req.method(), headers: req.headers() });
                if (req.url().endsWith('/audio/speech')) {
                    speeches.push(req.postDataJSON());
                    if (speechGate) { const gate = speechGate; speechGate = null; await gate; }
                    return route.fulfill({ status: failureStatus || 200, contentType: 'audio/wav', body: speechResponses.length ? speechResponses.shift() : wav });
                }
                const data = req.url().endsWith('/models') ? [{ id: 'irodori-tts', object: 'model' }]
                    : [{ id: 'alice', object: 'voice', no_ref: false }, { id: 'none', object: 'voice', no_ref: true }];
                await route.fulfill({ status: failureStatus || 200, contentType: 'application/json',
                    body: JSON.stringify(malformedVoices ? {} : { object: 'list', data }) });
            });
            await page.route('https://voicevox.test/**', async route => {
                voicevox.push({ url: route.request().url(), body: route.request().postDataJSON() });
                await route.fulfill({ contentType: route.request().url().includes('/audio_query') ? 'application/json' : 'audio/wav',
                    body: route.request().url().includes('/audio_query') ? '{}' : wav });
            });
            let responseText = '最初（補足です。Next. \n続き(入れ子。)も含む）です。次の文章。';
            await page.route('https://chat.test/**', route => route.fulfill({ contentType: 'text/event-stream',
                body: 'data: ' + JSON.stringify({ choices: [{ delta: { content: responseText } }] }) + '\n\ndata: [DONE]\n\n' }));
            await page.goto(pathToFileURL(path.resolve(__dirname, '..', entry)).href);
            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-speech').click();
            await expect(page.locator('#setting-voicevox-enabled')).toBeChecked();
            await expect(page.locator('#setting-voicevox-speaker')).toHaveValue('7');
            await expect(page.locator('#irodori-settings')).toBeHidden();
            await page.locator('#setting-irodori-enabled').check();
            await expect(page.locator('#setting-voicevox-enabled')).not.toBeChecked();
            await expect(page.locator('#voicevox-settings')).toBeHidden();
            await expect(page.locator('#irodori-settings')).toBeVisible();
            await page.locator('#setting-irodori-url').fill('https://irodori.test/');
            const status = page.locator('#irodori-status');
            await page.locator('#btn-irodori-test').click();
            await expect(status).toHaveText(ja ? '接続しました。' : 'Connected.');
            assert.equal(requests.at(-1).url, 'https://irodori.test/v1/models');
            assert.equal(requests.at(-1).headers.authorization, undefined, 'no chat key is sent to the TTS server');
            await page.locator('#setting-irodori-url').fill('https://irodori.test/proxy/v1/');
            await page.locator('#setting-irodori-apikey').fill('tts-key');
            await page.locator('#btn-irodori-load-voices').click();
            await expect(status).toHaveText(ja ? '話者リストを取得しました。' : 'Speakers loaded.');
            assert.equal(requests.at(-1).url, 'https://irodori.test/proxy/v1/audio/voices');
            assert.equal(requests.at(-1).headers.authorization, 'Bearer tts-key');
            await expect(page.locator('#irodori-voices option[value=alice]')).toHaveCount(1);
            await page.locator('#setting-irodori-voice').fill('alice');
            await page.locator('#setting-irodori-model').fill('custom-irodori');
            await page.locator('#setting-irodori-speed').fill('1.25');
            await page.locator('#setting-irodori-caption').fill('穏やかな声');
            await page.locator('#setting-irodori-num-steps').fill('12');
            await page.locator('#setting-irodori-seed').fill('0');
            const ruby = '｜漢字《かんじ》（補足）です。';
            await page.locator('#setting-irodori-test-text').fill(ruby);
            await page.locator('#btn-irodori-speak-test').click();
            await expect(status).toHaveText(ja ? '発話テストを再生しました。' : 'Test speech played.');
            assert.deepEqual(speeches.at(-1), { model: 'custom-irodori', input: '漢字です。', voice: 'alice',
                response_format: 'wav', speed: 1.25, irodori: { caption: '穏やかな声', num_steps: 12, seed: 0 } });
            assert.equal(await page.evaluate(() => Settings.get().irodoriEnabled), false, 'test uses unsaved form values');
            assert.equal(await page.evaluate(() => window.createdUrls.every(url => window.revokedUrls.includes(url))), true);
            // Silence is checked from decoded samples, without allocating playable URLs for failed attempts.
            const retrySuccess = ja ? '発話テストを再生しました。' : 'Test speech played.';
            const retryFailure = ja ? '発話テストに失敗しました。' : 'Test speech failed.';
            const runSpeechCase = async (responses, attempts, succeeds) => {
                speechResponses = responses;
                const count = speeches.length;
                const state = await page.evaluate(() => ({ urls: window.createdUrls.length, plays: window.playedAudio.length }));
                await page.locator('#btn-irodori-speak-test').click();
                if (succeeds) await expect(status).toHaveText(retrySuccess);
                else await expect(status).toContainText(retryFailure);
                assert.equal(speeches.length - count, attempts);
                for (const body of speeches.slice(count)) assert.deepEqual(body, speeches[count], 'retries keep request settings');
                assert.equal(await page.evaluate(() => window.createdUrls.length), state.urls + Number(succeeds));
                assert.equal(await page.evaluate(() => window.playedAudio.length), state.plays + Number(succeeds));
            };
            await runSpeechCase([silentWav, wav], 2, true);
            await runSpeechCase([makeWave({ bits: 8 }), makeWave({ bits: 32, float: true }), Buffer.alloc(0), wav], 4, true);
            await runSpeechCase([silentWav, silentWav, silentWav, silentWav, wav], 4, false);
            assert.equal(speechResponses.length, 1, 'never makes a fifth request');
            await expect(status).toContainText(ja ? '3回再試行' : 'Silent a');
            const quietStereo = makeWave({ channels: 2, sample: (frame, channel) =>
                channel === 1 && frame >= 4000 ? Math.round(16 * Math.sin(frame / 10)) : 0 });
            await runSpeechCase([quietStereo], 1, true); // Scan the entire file and every channel.
            await runSpeechCase([Buffer.from('invalid audio')], 1, false); // Decode failures are not silence retries.
            speechResponses = [];
            for (const [button, message] of [
                ['test', ja ? '接続に失敗しました。' : 'Connection failed.'],
                ['load-voices', ja ? '話者リストの取得に失敗しました。' : 'Failed to load speakers.'],
                ['speak-test', ja ? '発話テストに失敗しました。' : 'Test speech failed.'],
            ]) {
                failureStatus = 401;
                const count = requests.length;
                await page.locator('#btn-irodori-' + button).click();
                await expect(status).toHaveText(message + '(401)');
                assert.equal(requests.length, count + 1, 'HTTP errors are not silence retries');
            }
            failureStatus = 0;
            await page.locator('#setting-irodori-voice').fill(' relay-voice ');
            malformedVoices = true;
            await page.locator('#btn-irodori-load-voices').click();
            await expect(status).toContainText(ja ? '取得に失敗' : 'Failed to load');
            await expect(page.locator('#setting-irodori-voice')).toHaveValue(' relay-voice ');
            malformedVoices = false;
            await page.locator('#btn-irodori-load-voices').click();
            await expect(status).toHaveText(ja ? '話者リストを取得しました。' : 'Speakers loaded.');
            await expect(page.locator('#setting-irodori-voice')).toHaveValue(' relay-voice ');
            await page.locator('#btn-save-settings').click();
            await expect(page.locator('#settings-overlay')).toBeHidden();
            await page.reload();
            await page.locator('#btn-settings').click();
            await page.locator('#settings-tab-speech').click();
            await expect(page.locator('#setting-irodori-enabled')).toBeChecked();
            await expect(page.locator('#setting-irodori-voice')).toHaveValue('relay-voice');
            await expect(page.locator('#setting-irodori-seed')).toHaveValue('0');
            await expect(page.locator('#setting-irodori-caption')).toHaveValue('穏やかな声');
            // Empty optional fields must not override model defaults; annotation removal is optional.
            await page.locator('#setting-irodori-voice').fill('');
            await page.locator('#setting-irodori-caption').fill('');
            await page.locator('#setting-irodori-num-steps').fill('');
            await page.locator('#setting-irodori-seed').fill('');
            await page.locator('#setting-irodori-skip-annotations').uncheck();
            await page.locator('#setting-irodori-test-text').fill(ruby);
            await page.locator('#btn-irodori-speak-test').click();
            await expect(status).toHaveText(ja ? '発話テストを再生しました。' : 'Test speech played.');
            assert.equal(speeches.at(-1).input, ruby);
            assert.equal('voice' in speeches.at(-1), false);
            assert.equal('irodori' in speeches.at(-1), false);
            // Cancel restores the saved engine and parameters, including its cached voice list.
            await page.locator('#setting-voicevox-enabled').check();
            await expect(page.locator('#irodori-settings')).toBeHidden();
            await page.locator('#btn-cancel-settings').click();
            assert.equal(await page.evaluate(() => Settings.get().irodoriEnabled), true);
            const before = speeches.length;
            assert.equal(await page.evaluate(() => IrodoriClient.synthesize('（補足）')), null);
            assert.equal(speeches.length, before, 'annotation-only text does not call the server');
            await page.evaluate(() => { window.autoEndAudio = false; Settings.save({ ...Settings.get(), charDelayMs: 0, minDelaySec: 0 }); });
            let release;
            speechGate = new Promise(resolve => { release = resolve; });
            await page.locator('#user-input').fill('話してください');
            await page.locator('#btn-send').click();
            await expect.poll(() => speeches.length).toBe(before + 1);
            await expect(page.locator('.msg.assistant')).toHaveCount(0);
            release();
            await expect(page.locator('.msg.assistant')).toHaveCount(1);
            await expect(page.locator('.msg.assistant').first()).toHaveText('最初（補足です。Next. \n続き(入れ子。)も含む）です。');
            assert.equal(speeches[before].input, '最初です。');
            assert.equal(speeches[before].voice, 'relay-voice');
            await page.waitForTimeout(100);
            await expect(page.locator('.msg.assistant')).toHaveCount(1);
            await page.evaluate(() => window.playedAudio.at(-1).dispatchEvent(new Event('ended')));
            await expect(page.locator('.msg.assistant')).toHaveCount(2);
            assert.equal(speeches[before + 1].input, '次の文章。');
            await page.evaluate(() => window.playedAudio.at(-1).dispatchEvent(new Event('ended')));
            assert.equal(await page.evaluate(() => ChatHistory.peekLast().content), responseText);
            assert.equal(voicevox.length, 0, 'Irodori chat never requests VOICEVOX');
            await page.reload();
            await expect(page.locator('.msg.assistant')).toHaveCount(2);
            await expect(page.locator('.msg.assistant').first()).toHaveText('最初（補足です。Next. \n続き(入れ子。)も含む）です。');
            assert.equal(speeches.length, before + 2, 'restored history keeps parentheses together without resynthesizing');
            // Exhausting silence retries still displays the AI reply and lets the conversation finish.
            speechResponses = [silentWav, silentWav, silentWav, silentWav];
            const silentChatStart = speeches.length;
            responseText = '音声なしでも表示。';
            await page.locator('#user-input').fill('もう一度');
            await page.locator('#btn-send').click();
            await expect(page.locator('.msg.assistant').last()).toHaveText(responseText);
            assert.equal(speeches.length - silentChatStart, 4);
            // Interrupt a pending synthesis: its late audio must not play or appear in history.
            const playedBefore = await page.evaluate(() => window.playedAudio.length);
            responseText = '破棄する返答。';
            speechGate = new Promise(resolve => { release = resolve; });
            const pendingCount = speeches.length;
            await page.locator('#user-input').fill('古い質問');
            await page.locator('#btn-send').click();
            await expect.poll(() => speeches.length).toBe(pendingCount + 1);
            await page.evaluate(() => { window.autoEndAudio = true; });
            responseText = '新しい返答。';
            await page.locator('#user-input').fill('新しい質問');
            await page.locator('#btn-send').click();
            await expect(page.locator('.msg.assistant').last()).toHaveText(responseText);
            release();
            await expect.poll(() => page.evaluate(() => window.createdUrls.every(url => window.revokedUrls.includes(url)))).toBe(true);
            assert.equal(await page.evaluate(() => window.playedAudio.length), playedBefore + 1);
            assert.equal(await page.locator('.msg.assistant').filter({ hasText: '破棄する返答' }).count(), 0);
            // The shared path continues to handle existing VOICEVOX parameters and normalization.
            await page.evaluate(async () => {
                Settings.save({ ...Settings.get(), irodoriEnabled: false, voicevoxEnabled: true });
                await SpeechClient.play(await SpeechClient.synthesize('｜漢字《かんじ》（補足）です。'));
            });
            assert.match(voicevox[0].url, /speaker=7/);
            assert.equal(new URL(voicevox[0].url).searchParams.get('text'), '漢字です。');
            assert.equal(voicevox[1].body.speedScale, 1);
            await page.evaluate(() => Settings.save({ ...Settings.get(), voicevoxEnabled: false }));
            assert.equal(await page.evaluate(() => SpeechClient.synthesize('無効')), null);
            assert.deepEqual(errors, []);
            console.log('PASS ' + entry + ': manual voices, silence retries, API/auth, playback, interruption, VOICEVOX');
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
