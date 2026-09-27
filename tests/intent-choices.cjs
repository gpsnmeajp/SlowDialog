// Pure catalog/settings checks; no network or browser dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').split('const BackgroundImage =')[0];
function boot(lang, saved) {
    const context = vm.createContext({ document: { documentElement: { lang } }, localStorage: {
        getItem: () => saved ? JSON.stringify(saved) : null,
        setItem: (_, value) => { saved = JSON.parse(value); },
    } });
    vm.runInContext(source, context);
    return vm.runInContext('({ settings: Settings })', context);
}
let count;
for (const lang of ['ja', 'en']) {
    const { settings } = boot(lang);
    const labels = settings.load().intentChoices.split('\n');
    assert.ok(labels.length >= 80 && labels.length <= 255);
    assert.equal(new Set(labels).size, labels.length);
    assert.ok(labels.every(label => label && !/[\[\]]/.test(label)));
    if (count) assert.equal(labels.length, count);
    count = labels.length;
    for (const custom of ['Custom one\nCustom two', '', '要共感\n質問']) {
        assert.equal(boot(lang, { intentChoices: custom }).settings.load().intentChoices, custom);
    }
    console.log(`PASS ${lang}: ${count} choices, custom preservation`);
}
