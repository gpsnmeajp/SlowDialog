// Run with Node.js. Exercise the actual streaming and history splitters without a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { setTimeout: tick } = require('node:timers/promises');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const simulatorSource = source.slice(source.indexOf('const TypingSimulator ='), source.indexOf('const VoiceVoxClient ='));
const historySource = source.match(/    function _splitIntoChunks\(text\) \{[\s\S]*?\n    \}/)[0];

function boot(autoAdvance) {
    const context = vm.createContext({
        Settings: { get: () => ({ autoAdvance, charDelayMs: 0, minDelaySec: 0 }) },
        setTimeout, clearTimeout, console,
    });
    vm.runInContext(simulatorSource + '\n' + historySource, context);
    return vm.runInContext('({ simulator: TypingSimulator, speech: SpeechAudio, splitHistory: _splitIntoChunks })', context);
}

async function stream(parts, autoAdvance, checkPending) {
    const { simulator, speech } = boot(autoAdvance);
    const displayed = [], prepared = [], spoken = [];
    let complete;
    const done = new Promise(resolve => { complete = resolve; });
    simulator.start(
        text => { displayed.push(text); },
        complete,
        () => queueMicrotask(() => simulator.resumeManual()),
        null, null,
        text => {
            prepared.push(text);
            spoken.push(speech.normalizeText(text, true));
            return null;
        },
    );
    let watchdog;
    try {
        for (let i = 0; i < parts.length; i++) {
            simulator.feed(parts[i]);
            await tick(0);
            if (checkPending) checkPending(i, { displayed, prepared });
        }
        simulator.finish();
        await Promise.race([
            done,
            new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error('stream did not finish')), 2000); }),
        ]);
        assert.deepEqual(prepared, displayed, 'speech preparation and display use identical chunks');
        return { displayed, spoken };
    } finally {
        clearTimeout(watchdog);
        simulator.interrupt();
    }
}

const cases = [
    { text: '本文（補足です。続きです。改行\nも含む）です。次。',
        chunks: ['本文（補足です。続きです。改行\nも含む）です。', '次。'], spoken: ['本文です。', '次。'] },
    { text: '前。本文（補足。続き。）です。最後。',
        chunks: ['前。', '本文（補足。続き。）です。', '最後。'], spoken: ['前。', '本文です。', '最後。'] },
    { text: 'Text (first. second.\nthird) ends. Next.',
        chunks: ['Text (first. second.\nthird) ends. ', 'Next.'], spoken: ['Text ends. ', 'Next.'] },
    { text: '本文（外側。(内側。\n続き)外側の続き。）完了。次。',
        chunks: ['本文（外側。(内側。\n続き)外側の続き。）完了。', '次。'], spoken: ['本文完了。', '次。'] },
    { text: '本文(外側。（内側。\n続き）外側の続き。)完了。次。',
        chunks: ['本文(外側。（内側。\n続き）外側の続き。)完了。', '次。'], spoken: ['本文完了。', '次。'] },
    { text: '本文（補足。)続き。次(補足。）。',
        chunks: ['本文（補足。)続き。', '次(補足。）。'] },
    { text: '（補足。\n続き。）', chunks: ['（補足。\n続き。）'], spoken: [''] },
    { text: '本文(補足。)末尾', chunks: ['本文(補足。)末尾'], spoken: ['本文末尾'] },
    { text: '本文（閉じ忘れ。\n続き。', chunks: ['本文（閉じ忘れ。\n続き。'] },
    { text: '）)前。次（補足。続き）です。', chunks: ['）)前。', '次（補足。続き）です。'] },
    { text: '「前。後。」次。『前。後』次。',
        chunks: ['「前。', '後。」', '次。', '『前。', '後』次。'], wholeOnly: true },
    { text: '前。次。最終行\n末尾', chunks: ['前。', '次。', '最終行\n', '末尾'] },
    { text: '1. First. Second. ', chunks: ['1. First. ', 'Second. '] },
];

(async () => {
    const { splitHistory } = boot(true);
    for (const test of cases) {
        assert.deepEqual(Array.from(splitHistory(test.text)), test.chunks, 'history: ' + test.text);
        for (const autoAdvance of [true, false]) {
            const feeds = test.wholeOnly ? [[test.text]] : [[test.text], Array.from(test.text)];
            for (const parts of feeds) {
                const result = await stream(parts, autoAdvance);
                assert.deepEqual(result.displayed, test.chunks, `stream auto=${autoAdvance}: ${test.text}`);
                if (test.spoken) assert.deepEqual(result.spoken, test.spoken, 'annotations are removed as a whole');
            }
        }
    }
    for (const autoAdvance of [true, false]) {
        const result = await stream(['本文（途中。\n', '(内側。)', 'まだ括弧内。', '）続き。', '次。'], autoAdvance,
            (index, { displayed, prepared }) => {
                if (index < 3) {
                    assert.deepEqual(displayed, [], 'do not display an unfinished parenthesis');
                    assert.deepEqual(prepared, [], 'do not synthesize an unfinished parenthesis');
                }
            });
        assert.deepEqual(result.displayed, ['本文（途中。\n(内側。)まだ括弧内。）続き。', '次。']);
        assert.deepEqual(result.spoken, ['本文続き。', '次。']);
    }
    console.log('PASS chunking: parentheses, nesting, streaming, auto/manual, speech, history, quotation marks');
})().catch(error => { console.error(error); process.exitCode = 1; });
