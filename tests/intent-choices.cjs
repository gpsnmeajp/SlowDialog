// Pure catalog/settings checks; no network or browser dependencies.
// 意図選択肢カタログのバリデーション（重複なし・角括弧なし）とカスタム値の保存を検証
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// BackgroundImage 以降は DOM 依存のため、Settings までの部分のみを抽出
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8').split('const BackgroundImage =')[0];
// 指定言語・saved 設定で起動した最小限の仮想ブラウザ現場に Settings テストを実行
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
    // 選択肢は80以上255以下、重複なし、空文字・角括弧を含まない
    assert.ok(labels.length >= 80 && labels.length <= 255);
    assert.equal(new Set(labels).size, labels.length);
    assert.ok(labels.every(label => label && !/[\[\]]/.test(label)));
    // ja/enで選択肢の個数が一致する
    if (count) assert.equal(labels.length, count);
    count = labels.length;
    // カスタム値は上書きされずそのまま残る
    for (const custom of ['Custom one\nCustom two', '', '要共感\n質問']) {
        assert.equal(boot(lang, { intentChoices: custom }).settings.load().intentChoices, custom);
    }
    console.log(`PASS ${lang}: ${count} choices, custom preservation`);
}
