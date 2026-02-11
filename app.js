// ============================================================
// SlowDialog — app.js
// ============================================================
'use strict';

// ────────────────────────────────────────────────────────────
// Lang — HTMLのlang属性から言語を判定し、UIテキストを提供
// ────────────────────────────────────────────────────────────
const Lang = (() => {
    const _lang = document.documentElement.lang === 'en' ? 'en' : 'ja';

    const _strings = {
        ja: {
            defaultSystemPrompt: 'あなたは親切なアシスタントです。',
            defaultQuickResponses: 'なるほど\nちょっと待って\nそうじゃない',
            continueButton: '続きを読む ▼',
            bubbleUserAction: 'この発言を編集または再送信しますか？',
            bubbleResend: '再送信',
            bubbleEdit: '編集',
            bubbleEditTitle: 'メッセージ編集',
            bubbleEditSend: '送信',
            bubbleDeleteConfirm: 'この発言とそれ以降を削除しますか？',
            bubbleDelete: '削除',
            cancel: 'キャンセル',
        },
        en: {
            defaultSystemPrompt: 'You are a helpful assistant.',
            defaultQuickResponses: 'I see\nHold on\nThat\'s not right',
            continueButton: 'Continue ▼',
            bubbleUserAction: 'Edit or resend this message?',
            bubbleResend: 'Resend',
            bubbleEdit: 'Edit',
            bubbleEditTitle: 'Edit Message',
            bubbleEditSend: 'Send',
            bubbleDeleteConfirm: 'Delete this message and all subsequent messages?',
            bubbleDelete: 'Delete',
            cancel: 'Cancel',
        },
    };

    function current() { return _lang; }
    function t(key) { return _strings[_lang][key] || _strings['ja'][key] || key; }

    return { current, t };
})();

// ────────────────────────────────────────────────────────────
// Settings
// ────────────────────────────────────────────────────────────
const Settings = (() => {
    const STORAGE_KEY = 'slowdialog_settings';
    const DEFAULTS = {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
        model: 'google/gemini-3-flash-preview',
        systemPrompt: Lang.t('defaultSystemPrompt'),
        charDelayMs: 150,
        minDelaySec: 2,
        contextSize: 20,
        font: 'k8x12S',
        theme: 'gb',
        autoAdvance: true,
        soundEnabled: true,
        scanlineEffect: false,
        quickResponses: Lang.t('defaultQuickResponses'),
    };

    const FONT_MAP = {
        'k8x12S': "'k8x12S', monospace",
        'k8x12': "'k8x12', monospace",
        'k8x12L': "'k8x12L', monospace",
        'MisakiGothic': "'MisakiGothic', monospace",
        'NotoSansJP': "'Noto Sans JP', sans-serif",
    };

    let _settings = { ...DEFAULTS };

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) _settings = { ...DEFAULTS, ...JSON.parse(raw) };
        } catch { /* ignore */ }
        return _settings;
    }

    function save(s) {
        _settings = { ...DEFAULTS, ...s };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings));
    }

    function get() { return { ..._settings }; }

    function isConfigured() {
        return _settings.baseUrl && _settings.apiKey && _settings.model;
    }

    function applyFont() {
        const cssFont = FONT_MAP[_settings.font] || FONT_MAP[DEFAULTS.font];
        document.documentElement.style.setProperty('--app-font', cssFont);
    }

    function applyTheme() {
        const theme = _settings.theme || 'gb';
        if (theme === 'gb') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    function applyScanline() {
        if (_settings.scanlineEffect) {
            document.body.classList.add('scanline-on');
        } else {
            document.body.classList.remove('scanline-on');
        }
    }

    return { load, save, get, isConfigured, applyFont, applyTheme, applyScanline };
})();

// ────────────────────────────────────────────────────────────
// SimpleMarkdown — 簡易 Markdown パーサ
// ────────────────────────────────────────────────────────────
const SimpleMarkdown = (() => {
    /**
     * サポート:
     *   # 見出し / ## / ###
     *   **太字** / *斜体*
     *   `インラインコード`
     *   ```コードブロック```
     *   - リスト
     */
    function render(text) {
        if (!text) return '';

        // コードブロックを先に保護
        const codeBlocks = [];
        text = text.replace(/```[\s\S]*?```/g, (match) => {
            const code = match.slice(3, -3).replace(/^\w*\n/, ''); // 言語指定行を除去
            codeBlocks.push('<pre><code>' + _escapeHtml(code.trim()) + '</code></pre>');
            return '\x00CB' + (codeBlocks.length - 1) + '\x00';
        });

        // インラインコードを保護
        const inlineCodes = [];
        text = text.replace(/`([^`]+)`/g, (_, code) => {
            inlineCodes.push('<code>' + _escapeHtml(code) + '</code>');
            return '\x00IC' + (inlineCodes.length - 1) + '\x00';
        });

        // 行ごとに処理
        const lines = text.split('\n');
        const result = [];
        let inList = false;

        for (const line of lines) {
            // コードブロックプレースホルダー
            if (line.includes('\x00CB')) {
                if (inList) { result.push('</ul>'); inList = false; }
                result.push(line);
                continue;
            }

            const trimmed = line.trim();

            // 水平線(---等)はチャット形式では邪魔なのでスキップ
            if (/^[-*_]{3,}$/.test(trimmed)) continue;

            // 見出し
            const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
            if (headingMatch) {
                if (inList) { result.push('</ul>'); inList = false; }
                const level = headingMatch[1].length + 2; // # → h3, ## → h4, ### → h5
                result.push(`<h${level}>${_inlineFormat(headingMatch[2])}</h${level}>`);
                continue;
            }

            // リスト
            const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
            if (listMatch) {
                if (!inList) { result.push('<ul>'); inList = true; }
                result.push(`<li>${_inlineFormat(listMatch[1])}</li>`);
                continue;
            }

            // リスト終了
            if (inList && trimmed === '') {
                result.push('</ul>');
                inList = false;
                continue;
            }
            if (inList && !listMatch) {
                result.push('</ul>');
                inList = false;
            }

            // 空行
            if (trimmed === '') {
                result.push('<br>');
                continue;
            }

            // 通常の行
            result.push(_inlineFormat(trimmed));
        }
        if (inList) result.push('</ul>');

        let html = result.join('\n');

        // コードブロックを復元
        html = html.replace(/\x00CB(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i)]);
        // インラインコードを復元
        html = html.replace(/\x00IC(\d+)\x00/g, (_, i) => inlineCodes[parseInt(i)]);

        return html;
    }

    /** インライン書式: **太字**, *斜体* */
    function _inlineFormat(text) {
        text = _escapeHtml(text);
        // **bold**
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // *italic* (前後が * でないもの)
        text = text.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
        // インラインコードプレースホルダーはそのまま通過
        return text;
    }

    function _escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    return { render };
})();

// ────────────────────────────────────────────────────────────
// ChatHistory
// ────────────────────────────────────────────────────────────
const ChatHistory = (() => {
    const STORAGE_KEY = 'slowdialog_history';
    let _messages = []; // { role, content }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) _messages = JSON.parse(raw);
        } catch { /* ignore */ }
        return _messages;
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_messages));
    }

    function push(role, content) {
        _messages.push({ role, content });
        _trimToContext();
        save();
    }

    /** 最後のメッセージの content を更新 */
    function updateLast(content) {
        if (_messages.length === 0) return;
        _messages[_messages.length - 1].content = content;
        save();
    }

    /** 最後のメッセージを削除 */
    function popLast() {
        const m = _messages.pop();
        save();
        return m;
    }

    /** 最後のメッセージを取得 */
    function peekLast() {
        return _messages.length > 0 ? _messages[_messages.length - 1] : null;
    }

    function getAll() { return [..._messages]; }

    function clear() {
        _messages = [];
        save();
    }

    /** 指定インデックス以降のメッセージをすべて削除 */
    function truncateFrom(index) {
        if (index < 0 || index >= _messages.length) return;
        _messages = _messages.slice(0, index);
        save();
    }

    /** 指定インデックスのメッセージの content を更新 */
    function updateAt(index, content) {
        if (index < 0 || index >= _messages.length) return;
        _messages[index].content = content;
        save();
    }

    /** コンテキストサイズに収まるようにトリム */
    function _trimToContext() {
        const maxLen = Settings.get().contextSize;
        while (_messages.length > maxLen) {
            _messages.shift();
        }
    }

    /** API に送るメッセージ配列を構築 */
    function buildApiMessages() {
        const sys = Settings.get().systemPrompt;
        const msgs = [];
        if (sys) msgs.push({ role: 'system', content: sys });
        msgs.push(..._messages);
        return msgs;
    }

    function exportJSON() {
        const s = Settings.get();
        const exportData = [];
        if (s.quickResponses) exportData.push({ role: '_quickresponse', content: s.quickResponses });
        if (s.systemPrompt) exportData.push({ role: 'system', content: s.systemPrompt });
        exportData.push(..._messages);
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `slowdialog_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function importJSON(data) {
        // _quickresponse エントリがあれば設定に反映
        const qrMsg = data.find(m => m.role === '_quickresponse');
        if (qrMsg) {
            const s = Settings.get();
            s.quickResponses = qrMsg.content;
            Settings.save(s);
        }
        // system / _quickresponse メッセージは除外して会話メッセージのみ取り込む
        _messages = data.filter(m => m.role !== 'system' && m.role !== '_quickresponse');
        save();
    }

    return { load, save, push, updateLast, updateAt, popLast, peekLast, getAll, clear, truncateFrom, buildApiMessages, exportJSON, importJSON };
})();

// ────────────────────────────────────────────────────────────
// ApiClient
// ────────────────────────────────────────────────────────────
const ApiClient = (() => {
    let _abortCtrl = null;

    /** SSE ストリームを開始し、チャンクごとに onChunk(text) を呼ぶ。完了時 onDone() */
    async function streamChat(messages, { onChunk, onDone, onError }) {
        abort(); // 前回のリクエストをキャンセル
        _abortCtrl = new AbortController();
        const { baseUrl, apiKey, model } = Settings.get();

        try {
            const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    stream: true,
                }),
                signal: _abortCtrl.signal,
            });

            if (!res.ok) {
                throw new Error(`API error: ${res.status} ${res.statusText}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop(); // 最後の不完全行をバッファに残す

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:')) continue;
                    const data = trimmed.slice(5).trim();
                    if (data === '[DONE]') continue;
                    try {
                        const json = JSON.parse(data);
                        const delta = json.choices?.[0]?.delta?.content;
                        if (delta) onChunk(delta);
                    } catch { /* skip malformed JSON */ }
                }
            }
            onDone();
        } catch (err) {
            if (err.name === 'AbortError') {
                onDone(true); // aborted
            } else {
                onError(err);
            }
        }
    }

    function abort() {
        if (_abortCtrl) {
            _abortCtrl.abort();
            _abortCtrl = null;
        }
    }

    return { streamChat, abort };
})();

// ────────────────────────────────────────────────────────────
// TypingSimulator — チャット風チャンク送出
// ────────────────────────────────────────────────────────────
const TypingSimulator = (() => {
    let _buffer = '';         // 受信テキストの未処理バッファ
    let _displayedText = '';  // 表示済みテキスト全体
    let _timer = null;
    let _streamDone = false;
    let _onDisplayChunk = null; // (chunkText, fullText) => void
    let _onAllDone = null;

    let _onWaitManual = null;
    let _manualQueue = [];      // 手動モード: チャンクのキュー
    let _manualWaiting = false; // 手動モード: ボタン待ち状態か
    let _isFirstChunk = true;   // 最初のチャンクは自動表示

    function start(onDisplayChunk, onAllDone, onWaitManual) {
        _buffer = '';
        _displayedText = '';
        _streamDone = false;
        _onDisplayChunk = onDisplayChunk;
        _onAllDone = onAllDone;
        _onWaitManual = onWaitManual || null;
        _manualQueue = [];
        _manualWaiting = false;
        _isFirstChunk = true;
    }

    /** API から受信したテキストをバッファに追加 */
    function feed(text) {
        _buffer += text;
        _tryFlush();
    }

    /** ストリーム完了を通知 */
    function finish() {
        _streamDone = true;
        _tryFlush();
    }

    /** 割り込みによる即時停止 */
    function interrupt() {
        clearTimeout(_timer);
        _timer = null;
        _streamDone = true;
        _manualQueue = [];
        _manualWaiting = false;
        return _displayedText;
    }

    function getDisplayedText() {
        return _displayedText;
    }

    function _tryFlush() {
        if (_timer) return;

        // 手動モードでボタン待ち中なら、新チャンクはキューに積むだけ
        const s = Settings.get();
        if (!s.autoAdvance && _manualWaiting) {
            // バッファからチャンクを抽出してキューに積む
            let chunk = _extractNextChunk();
            while (chunk !== null) {
                _manualQueue.push(chunk);
                chunk = _extractNextChunk();
            }
            if (_streamDone && _buffer.length > 0) {
                _manualQueue.push(_buffer);
                _buffer = '';
            }
            return;
        }

        const chunk = _extractNextChunk();
        if (chunk !== null) {
            _scheduleDisplay(chunk);
        } else if (_streamDone && _buffer.length > 0) {
            const remaining = _buffer;
            _buffer = '';
            _scheduleDisplay(remaining);
        } else if (_streamDone && _buffer.length === 0 && _manualQueue.length === 0) {
            if (_onAllDone) _onAllDone();
        }
    }

    function _extractNextChunk() {
        let idx = -1;
        for (let i = 0; i < _buffer.length; i++) {
            const ch = _buffer[i];
            if (ch === '。' || (ch === '.' && i + 1 < _buffer.length && _buffer[i + 1] === ' ')) {
                idx = (ch === '.') ? i + 1 : i; // '. ' の場合はスペースも含める
                break;
            }
            if (ch === '\n') {
                if (i > 0) {
                    idx = i;
                    break;
                }
            }
        }
        if (idx === -1) return null;

        const chunk = _buffer.slice(0, idx + 1);
        _buffer = _buffer.slice(idx + 1);
        _buffer = _buffer.replace(/^\n+/, '');
        return chunk;
    }

    function _scheduleDisplay(chunk) {
        const s = Settings.get();
        if (!s.autoAdvance) {
            if (_isFirstChunk) {
                // 最初のチャンクは自動表示
                _isFirstChunk = false;
                _displayedText += chunk;
                if (_onDisplayChunk) _onDisplayChunk(chunk, _displayedText);
                _tryFlush();
                return;
            }
            // 手動モード: キューに積んでボタン表示
            _manualQueue.push(chunk);
            if (!_manualWaiting) {
                _manualWaiting = true;
                if (_onWaitManual) _onWaitManual();
            }
            return;
        }
        _isFirstChunk = false;
        _displayedText += chunk;
        if (_onDisplayChunk) _onDisplayChunk(chunk, _displayedText);
        const typingDelay = chunk.length * s.charDelayMs;
        const minDelay = (s.minDelaySec || 0) * 1000;
        const delay = Math.max(typingDelay, minDelay);
        _timer = setTimeout(() => {
            _timer = null;
            _tryFlush();
        }, delay);
    }

    /** 手動モードでキューの先頭チャンクを表示して次へ進む */
    function resumeManual() {
        if (_manualQueue.length === 0) {
            _manualWaiting = false;
            // ストリーム完了チェック
            if (_streamDone && _buffer.length === 0) {
                if (_onAllDone) _onAllDone();
            }
            return;
        }
        const chunk = _manualQueue.shift();
        _displayedText += chunk;
        if (_onDisplayChunk) _onDisplayChunk(chunk, _displayedText);

        // キューにまだ残りがあるか、バッファから追加抽出
        _tryFlush();

        if (_manualQueue.length === 0 && _streamDone && _buffer.length === 0) {
            _manualWaiting = false;
            if (_onAllDone) _onAllDone();
        } else if (_manualQueue.length === 0 && !_streamDone) {
            // ストリーム中でキュー空 → 次のチャンクが届くまで待ち解除
            _manualWaiting = false;
        }
        // else: キューにまだある → ボタン再表示は UIController 側で制御
    }

    function hasMoreChunks() {
        return _manualQueue.length > 0 || (!_streamDone && _buffer.length > 0);
    }

    /** autoAdvance=true に切り替え時: 手動キューをバッファに戻して自動進行を再開 */
    function switchToAutoAdvance() {
        _manualWaiting = false;
        if (_manualQueue.length > 0) {
            const queuedText = _manualQueue.join('');
            _manualQueue = [];
            _buffer = queuedText + _buffer;
        }
        if (!_timer) {
            _tryFlush();
        }
    }

    /** autoAdvance=false に切り替え時: 自動進行タイマーを停止し手動モードへ遷移 */
    function switchToManualAdvance() {
        if (_timer) {
            clearTimeout(_timer);
            _timer = null;
        }
        _isFirstChunk = false; // 途中切替なので最初のチャンク扱いしない
        _tryFlush();
    }

    return { start, feed, finish, interrupt, getDisplayedText, resumeManual, hasMoreChunks, switchToAutoAdvance, switchToManualAdvance };
})();

// ────────────────────────────────────────────────────────────
// SoundManager — 効果音の再生
// ────────────────────────────────────────────────────────────
const SoundManager = (() => {
    const _cache = {};

    function _getAudio(name) {
        if (!_cache[name]) {
            _cache[name] = new Audio(`sound/${name}.wav`);
        }
        return _cache[name];
    }

    function play(name) {
        if (!Settings.get().soundEnabled) return;
        try {
            const audio = _getAudio(name);
            audio.currentTime = 0;
            audio.play().catch(() => { /* autoplay blocked */ });
        } catch { /* ignore */ }
    }

    return { play };
})();

// ────────────────────────────────────────────────────────────
// UIController
// ────────────────────────────────────────────────────────────
const UIController = (() => {
    // DOM refs
    const chatMessages = document.getElementById('chat-messages');
    const chatArea = document.getElementById('chat-area');
    const userInput = document.getElementById('user-input');
    const btnSend = document.getElementById('btn-send');
    const quickResponsesContainer = document.getElementById('quick-responses');
    const btnSettings = document.getElementById('btn-settings');
    const btnExport = document.getElementById('btn-export');
    const btnClear = document.getElementById('btn-clear');
    const btnImport = document.getElementById('btn-import');
    const importOverlay = document.getElementById('import-overlay');
    const importFileInput = document.getElementById('import-file');
    const importJsonArea = document.getElementById('import-json');
    const importError = document.getElementById('import-error');
    const btnImportExec = document.getElementById('btn-import-exec');
    const btnImportCancel = document.getElementById('btn-import-cancel');
    const confirmOverlay = document.getElementById('confirm-overlay');
    const btnConfirmOk = document.getElementById('btn-confirm-ok');
    const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsForm = document.getElementById('settings-form');
    const btnCancel = document.getElementById('btn-cancel-settings');
    const retryBar = document.getElementById('retry-bar');
    const btnRetry = document.getElementById('btn-retry');
    const introOverlay = document.getElementById('intro-overlay');
    const btnIntroNext = document.getElementById('btn-intro-next');

    // Bubble action dialog refs
    const bubbleActionOverlay = document.getElementById('bubble-action-overlay');
    const bubbleActionText = document.getElementById('bubble-action-text');
    const btnBubbleResend = document.getElementById('btn-bubble-resend');
    const btnBubbleEdit = document.getElementById('btn-bubble-edit');
    const btnBubbleActionCancel = document.getElementById('btn-bubble-action-cancel');
    // Bubble edit dialog refs
    const bubbleEditOverlay = document.getElementById('bubble-edit-overlay');
    const bubbleEditTitle = document.getElementById('bubble-edit-title');
    const bubbleEditText = document.getElementById('bubble-edit-text');
    const btnBubbleEditSend = document.getElementById('btn-bubble-edit-send');
    const btnBubbleEditCancel = document.getElementById('btn-bubble-edit-cancel');
    // Bubble delete dialog refs
    const bubbleDeleteOverlay = document.getElementById('bubble-delete-overlay');
    const bubbleDeleteText = document.getElementById('bubble-delete-text');
    const btnBubbleDeleteOk = document.getElementById('btn-bubble-delete-ok');
    const btnBubbleDeleteCancel = document.getElementById('btn-bubble-delete-cancel');

    // State
    let _isStreaming = false;
    let _typingIndicator = null;
    let _assistantBubblesInTurn = []; // 現在のターンで追加された assistant バブル
    let _lastRetryMessages = null;
    let _bubbleTapIndex = null; // バブルタップ対象の履歴インデックス
    let _bubbleTapChunkIndex = null; // バブルタップ対象のチャンクインデックス
    let _originalTheme = null; // 設定ダイアログを開いた時のテーマ

    function init() {
        Settings.load();
        Settings.applyFont();
        Settings.applyTheme();
        Settings.applyScanline();
        ChatHistory.load();

        _renderAllMessages();
        _bindEvents();
        _renderQuickResponses();

        const introSeen = localStorage.getItem('slowdialog_intro_seen');
        if (!introSeen) {
            // 初回起動: イントロ → 設定
            introOverlay.classList.remove('hidden');
        } else if (!Settings.isConfigured()) {
            openSettings();
        }
    }

    // ─── Event Binding ───
    function _bindEvents() {
        btnSend.addEventListener('click', _handleSend);
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                _handleSend();
            }
        });
        userInput.addEventListener('input', _autoResize);

        btnSettings.addEventListener('click', openSettings);
        btnCancel.addEventListener('click', closeSettings);
        settingsForm.addEventListener('submit', _handleSaveSettings);
        document.getElementById('setting-theme').addEventListener('change', _handleThemePreview);
        settingsOverlay.addEventListener('click', (e) => {
            if (e.target === settingsOverlay) {
                const dialog = document.getElementById('settings-dialog');
                dialog.scrollTo({ top: dialog.scrollHeight, behavior: 'smooth' });
            }
        });

        btnExport.addEventListener('click', () => ChatHistory.exportJSON());
        btnImport.addEventListener('click', _openImportDialog);
        btnImportExec.addEventListener('click', _handleImport);
        btnImportCancel.addEventListener('click', _closeImportDialog);
        importOverlay.addEventListener('click', (e) => {
            if (e.target === importOverlay) _closeImportDialog();
        });
        importFileInput.addEventListener('change', _handleImportFile);
        btnClear.addEventListener('click', _handleClear);
        btnConfirmOk.addEventListener('click', _executeClear);
        btnConfirmCancel.addEventListener('click', _closeConfirmDialog);
        confirmOverlay.addEventListener('click', (e) => {
            if (e.target === confirmOverlay) _closeConfirmDialog();
        });
        btnRetry.addEventListener('click', _handleRetry);

        // Bubble tap (delegated)
        chatMessages.addEventListener('click', _handleBubbleTap);

        // Bubble action dialog
        btnBubbleResend.addEventListener('click', _handleBubbleResend);
        btnBubbleEdit.addEventListener('click', _handleBubbleEditOpen);
        btnBubbleActionCancel.addEventListener('click', _closeBubbleActionDialog);
        bubbleActionOverlay.addEventListener('click', (e) => {
            if (e.target === bubbleActionOverlay) _closeBubbleActionDialog();
        });
        // Bubble edit dialog
        btnBubbleEditSend.addEventListener('click', _handleBubbleEditSend);
        btnBubbleEditCancel.addEventListener('click', _closeBubbleEditDialog);
        bubbleEditOverlay.addEventListener('click', (e) => {
            if (e.target === bubbleEditOverlay) _closeBubbleEditDialog();
        });
        // Bubble delete dialog
        btnBubbleDeleteOk.addEventListener('click', _handleBubbleDelete);
        btnBubbleDeleteCancel.addEventListener('click', _closeBubbleDeleteDialog);
        bubbleDeleteOverlay.addEventListener('click', (e) => {
            if (e.target === bubbleDeleteOverlay) _closeBubbleDeleteDialog();
        });

        btnIntroNext.addEventListener('click', () => {
            introOverlay.classList.add('hidden');
            localStorage.setItem('slowdialog_intro_seen', '1');
            if (!Settings.isConfigured()) {
                openSettings();
            }
        });
    }

    // ─── Send Message ───
    function _handleSend() {
        const text = userInput.value.trim();
        if (!text) return;

        if (!Settings.isConfigured()) {
            openSettings();
            return;
        }

        userInput.value = '';
        _autoResize();
        _hideRetryBar();

        // 割り込み処理
        if (_isStreaming) {
            _performInterrupt(text);
        } else {
            _sendNewMessage(text);
        }
    }

    function _sendNewMessage(text) {
        ChatHistory.push('user', text);
        const idx = ChatHistory.getAll().length - 1;
        _appendBubble('user', text, idx);
        SoundManager.play('user');
        _startStreaming();
    }

    function _performInterrupt(newText) {
        // ストリームを中断
        ApiClient.abort();
        const displayedText = TypingSimulator.interrupt();
        _removeTypingIndicator();
        _removeContinueButton();

        const lastMsg = ChatHistory.peekLast();

        if (lastMsg && lastMsg.role === 'assistant') {
            // AI が何か出力していた → 表示済みテキストで確定
            if (displayedText.trim()) {
                ChatHistory.updateLast(displayedText);
            } else {
                // まだ何も表示されていなかった → assistant メッセージ自体を削除
                ChatHistory.popLast();
                // このターンの assistant バブルをすべて削除
                for (const b of _assistantBubblesInTurn) b.remove();
            }
        }
        _assistantBubblesInTurn = [];

        // AI が 1 メッセージも表示していない場合 → ユーザーメッセージを連結
        const currentLast = ChatHistory.peekLast();
        if (currentLast && currentLast.role === 'user') {
            const combined = currentLast.content + '\n' + newText;
            ChatHistory.updateLast(combined);
            _updateLastBubbleText(combined);
        } else {
            ChatHistory.push('user', newText);
            const idx = ChatHistory.getAll().length - 1;
            _appendBubble('user', newText, idx);
        }

        _isStreaming = false;
        _startStreaming();
    }

    function _startStreaming() {
        _isStreaming = true;
        _showTypingIndicator();

        // API に送るメッセージを構築したら、空の assistant エントリを履歴に仮追加
        const apiMessages = ChatHistory.buildApiMessages();
        _lastRetryMessages = apiMessages;
        ChatHistory.push('assistant', '');
        const assistantHistIdx = ChatHistory.getAll().length - 1;

        _assistantBubblesInTurn = [];
        let _streamChunkCounter = 0;

        TypingSimulator.start(
            // onDisplayChunk
            (chunk, fullText) => {
                _removeTypingIndicator();
                _removeContinueButton();
                const bubble = _appendBubble('assistant', chunk.trim(), assistantHistIdx, _streamChunkCounter++);
                _assistantBubblesInTurn.push(bubble);
                SoundManager.play('assistant');
                ChatHistory.updateLast(fullText);
                if (_isStreaming) {
                    if (Settings.get().autoAdvance) {
                        _showTypingIndicator();
                    }
                }
                _scrollToBottom();
            },
            // onAllDone
            () => {
                _removeTypingIndicator();
                _removeContinueButton();
                _isStreaming = false;
                const last = ChatHistory.peekLast();
                if (last && last.role === 'assistant' && !last.content.trim()) {
                    ChatHistory.popLast();
                } else {
                    SoundManager.play('assistant_end');
                }
            },
            // onWaitManual — 手動モードでチャンク待機時
            () => {
                _removeTypingIndicator();
                _showContinueButton();
            }
        );

        ApiClient.streamChat(apiMessages, {
            onChunk: (text) => TypingSimulator.feed(text),
            onDone: (aborted) => {
                if (!aborted) TypingSimulator.finish();
            },
            onError: (err) => {
                console.error('API error:', err);
                _isStreaming = false;
                TypingSimulator.interrupt();
                _removeTypingIndicator();
                // 空の assistant メッセージを削除
                const last = ChatHistory.peekLast();
                if (last && last.role === 'assistant' && !last.content.trim()) {
                    ChatHistory.popLast();
                }
                _showRetryBar();
            }
        });
    }

    // ─── Retry ───
    function _handleRetry() {
        _hideRetryBar();
        if (_lastRetryMessages) {
            _startStreaming();
        }
    }

    // ─── Clear ───
    function _handleClear() {
        confirmOverlay.classList.remove('hidden');
    }

    function _closeConfirmDialog() {
        confirmOverlay.classList.add('hidden');
    }

    function _executeClear() {
        _closeConfirmDialog();
        if (_isStreaming) {
            ApiClient.abort();
            TypingSimulator.interrupt();
            _isStreaming = false;
        }
        ChatHistory.clear();
        chatMessages.innerHTML = '';
        _assistantBubblesInTurn = [];
        _typingIndicator = null;
        _continueBtn = null;
        _hideRetryBar();
    }

    // ─── Import ───
    function _openImportDialog() {
        importFileInput.value = '';
        importJsonArea.value = '';
        importError.classList.add('hidden');
        importError.textContent = '';
        importOverlay.classList.remove('hidden');
    }

    function _closeImportDialog() {
        importOverlay.classList.add('hidden');
    }

    function _handleImportFile() {
        const file = importFileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            importJsonArea.value = e.target.result;
        };
        reader.readAsText(file);
    }

    function _handleImport() {
        importError.classList.add('hidden');
        const raw = importJsonArea.value.trim();
        if (!raw) {
            _showImportError(Lang.current() === 'en' ? 'No data provided.' : 'データがありません。');
            return;
        }
        let data;
        try {
            data = JSON.parse(raw);
        } catch {
            _showImportError(Lang.current() === 'en' ? 'Invalid JSON format.' : 'JSONの形式が不正です。');
            return;
        }
        if (!Array.isArray(data) || data.length === 0) {
            _showImportError(Lang.current() === 'en' ? 'JSON must be a non-empty array.' : 'JSONは空でない配列である必要があります。');
            return;
        }
        const valid = data.every(m => m && typeof m.role === 'string' && typeof m.content === 'string');
        if (!valid) {
            _showImportError(Lang.current() === 'en' ? 'Each item must have "role" and "content".' : '各要素に "role" と "content" が必要です。');
            return;
        }
        // システムプロンプトがあれば設定に反映
        const systemMsg = data.find(m => m.role === 'system');
        if (systemMsg) {
            const s = Settings.get();
            s.systemPrompt = systemMsg.content;
            Settings.save(s);
        }
        // ストリーミング中なら停止
        if (_isStreaming) {
            ApiClient.abort();
            TypingSimulator.interrupt();
            _isStreaming = false;
        }
        ChatHistory.importJSON(data);
        chatMessages.innerHTML = '';
        _assistantBubblesInTurn = [];
        _typingIndicator = null;
        _continueBtn = null;
        _hideRetryBar();
        _renderAllMessages();
        _renderQuickResponses();
        _closeImportDialog();
    }

    function _showImportError(msg) {
        importError.textContent = msg;
        importError.classList.remove('hidden');
    }

    // ─── DOM Helpers ───
    function _appendBubble(role, text, historyIndex, chunkIndex) {
        const div = document.createElement('div');
        div.className = `msg ${role}`;
        if (typeof historyIndex === 'number') {
            div.dataset.historyIndex = historyIndex;
        }
        if (typeof chunkIndex === 'number') {
            div.dataset.chunkIndex = chunkIndex;
        }
        if (role === 'assistant') {
            div.innerHTML = SimpleMarkdown.render(text);
        } else {
            div.textContent = text;
        }
        chatMessages.appendChild(div);
        _scrollToBottom();
        return div;
    }

    function _removeLastBubble() {
        const bubbles = chatMessages.querySelectorAll('.msg');
        if (bubbles.length > 0) {
            bubbles[bubbles.length - 1].remove();
        }
    }

    function _updateLastBubbleText(text) {
        const bubbles = chatMessages.querySelectorAll('.msg.user');
        if (bubbles.length > 0) {
            bubbles[bubbles.length - 1].textContent = text;
        }
    }

    function _showTypingIndicator() {
        if (_typingIndicator) return;
        _typingIndicator = document.createElement('div');
        _typingIndicator.className = 'typing-indicator';
        _typingIndicator.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        chatMessages.appendChild(_typingIndicator);
        _scrollToBottom();
    }

    function _removeTypingIndicator() {
        if (_typingIndicator) {
            _typingIndicator.remove();
            _typingIndicator = null;
        }
    }

    // ─── Continue Button (手動モード) ───
    let _continueBtn = null;

    function _showContinueButton() {
        if (_continueBtn) return;
        _continueBtn = document.createElement('button');
        _continueBtn.className = 'continue-btn';
        _continueBtn.textContent = Lang.t('continueButton');
        _continueBtn.addEventListener('click', () => {
            _removeContinueButton();
            TypingSimulator.resumeManual();
            // まだチャンクが残っていればボタンを再表示
            if (TypingSimulator.hasMoreChunks()) {
                _showContinueButton();
            }
        });
        chatMessages.appendChild(_continueBtn);
        _scrollToBottom();
    }

    function _removeContinueButton() {
        if (_continueBtn) {
            _continueBtn.remove();
            _continueBtn = null;
        }
    }

    function _showRetryBar() {
        retryBar.classList.remove('hidden');
    }

    function _hideRetryBar() {
        retryBar.classList.add('hidden');
    }

    function _scrollToBottom() {
        requestAnimationFrame(() => {
            chatArea.scrollTop = chatArea.scrollHeight;
        });
    }

    function _autoResize() {
        userInput.style.height = 'auto';
        userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
    }

    // ─── Quick Responses ───
    function _renderQuickResponses() {
        quickResponsesContainer.innerHTML = '';
        const raw = Settings.get().quickResponses || '';
        const items = raw.split('\n').map(s => s.trim()).filter(Boolean);
        if (items.length === 0) {
            quickResponsesContainer.classList.add('hidden');
            return;
        }
        quickResponsesContainer.classList.remove('hidden');
        for (const text of items) {
            const btn = document.createElement('button');
            btn.className = 'quick-response-btn';
            btn.textContent = text;
            btn.addEventListener('click', () => _handleQuickResponse(text));
            quickResponsesContainer.appendChild(btn);
        }
    }

    function _handleQuickResponse(text) {
        if (!Settings.isConfigured()) {
            openSettings();
            return;
        }
        _hideRetryBar();
        if (_isStreaming) {
            _performInterrupt(text);
        } else {
            _sendNewMessage(text);
        }
    }

    /** 履歴からメッセージを復元表示。assistant メッセージはチャンク分割して複数バブルで表示 */
    function _renderAllMessages() {
        chatMessages.innerHTML = '';
        const messages = ChatHistory.getAll();
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (!msg.content.trim()) continue;
            if (msg.role === 'assistant') {
                // チャンク分割して個別バブルとして表示
                const chunks = _splitIntoChunks(msg.content);
                let ci = 0;
                for (const chunk of chunks) {
                    if (chunk.trim()) _appendBubble('assistant', chunk.trim(), i, ci++);
                }
            } else {
                _appendBubble(msg.role, msg.content, i);
            }
        }
        _scrollToBottom();
    }

    /** テキストを「。」「. 」改行で分割（空行は区切りとしない） */
    function _splitIntoChunks(text) {
        const chunks = [];
        let current = '';
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            current += ch;
            if (ch === '。') {
                chunks.push(current);
                current = '';
            } else if (ch === '.' && i + 1 < text.length && text[i + 1] === ' ') {
                current += text[++i]; // スペースも含める
                chunks.push(current);
                current = '';
            } else if (ch === '\n' && current.trim().length > 1) {
                chunks.push(current);
                current = '';
            }
        }
        if (current.trim()) chunks.push(current);
        return chunks;
    }

    // ─── Bubble Tap ───
    function _handleBubbleTap(e) {
        // ストリーミング中はタップ無効
        // if (_isStreaming) return;

        const bubble = e.target.closest('.msg');
        if (!bubble) return;
        if (bubble.dataset.historyIndex === undefined) return;

        const idx = parseInt(bubble.dataset.historyIndex, 10);
        const messages = ChatHistory.getAll();
        if (idx < 0 || idx >= messages.length) return;

        _bubbleTapIndex = idx;
        _bubbleTapChunkIndex = bubble.dataset.chunkIndex !== undefined
            ? parseInt(bubble.dataset.chunkIndex, 10) : null;
        const msg = messages[idx];

        if (msg.role === 'user') {
            // ユーザーバブル → アクションダイアログ
            bubbleActionText.textContent = Lang.t('bubbleUserAction');
            btnBubbleResend.textContent = Lang.t('bubbleResend');
            btnBubbleEdit.textContent = Lang.t('bubbleEdit');
            btnBubbleActionCancel.textContent = Lang.t('cancel');
            bubbleActionOverlay.classList.remove('hidden');
        } else if (msg.role === 'assistant') {
            // アシスタントバブル → 削除確認ダイアログ
            bubbleDeleteText.textContent = Lang.t('bubbleDeleteConfirm');
            btnBubbleDeleteOk.textContent = Lang.t('bubbleDelete');
            btnBubbleDeleteCancel.textContent = Lang.t('cancel');
            bubbleDeleteOverlay.classList.remove('hidden');
        }
    }

    function _closeBubbleActionDialog() {
        bubbleActionOverlay.classList.add('hidden');
        _bubbleTapIndex = null;
        _bubbleTapChunkIndex = null;
    }

    function _closeBubbleEditDialog() {
        bubbleEditOverlay.classList.add('hidden');
        _bubbleTapIndex = null;
        _bubbleTapChunkIndex = null;
    }

    function _closeBubbleDeleteDialog() {
        bubbleDeleteOverlay.classList.add('hidden');
        _bubbleTapIndex = null;
        _bubbleTapChunkIndex = null;
    }

    /** ユーザーバブル: 再送信 */
    function _handleBubbleResend() {
        if (_bubbleTapIndex === null) return;
        const idx = _bubbleTapIndex;
        const messages = ChatHistory.getAll();
        const text = messages[idx].content;

        // idx+1 以降を削除
        ChatHistory.truncateFrom(idx + 1);
        // DOM を再描画
        _renderAllMessages();
        _assistantBubblesInTurn = [];
        _typingIndicator = null;
        _continueBtn = null;
        _hideRetryBar();

        _closeBubbleActionDialog();

        // 再送信（同じテキストをそのまま送信）
        if (!Settings.isConfigured()) {
            openSettings();
            return;
        }
        _startStreaming();
    }

    /** ユーザーバブル: 編集ダイアログを開く */
    function _handleBubbleEditOpen() {
        bubbleActionOverlay.classList.add('hidden');
        if (_bubbleTapIndex === null) return;
        const messages = ChatHistory.getAll();
        const text = messages[_bubbleTapIndex].content;

        bubbleEditTitle.textContent = Lang.t('bubbleEditTitle');
        btnBubbleEditSend.textContent = Lang.t('bubbleEditSend');
        btnBubbleEditCancel.textContent = Lang.t('cancel');
        bubbleEditText.value = text;
        bubbleEditOverlay.classList.remove('hidden');
        bubbleEditText.focus();
    }

    /** ユーザーバブル: 編集したテキストを送信 */
    function _handleBubbleEditSend() {
        if (_bubbleTapIndex === null) return;
        const idx = _bubbleTapIndex;
        const newText = bubbleEditText.value.trim();
        if (!newText) return;

        // idx 以降を削除（そのユーザーメッセージ自体も含む）
        ChatHistory.truncateFrom(idx);
        // 編集テキストを新しいユーザーメッセージとして追加
        ChatHistory.push('user', newText);

        // DOM を再描画
        _renderAllMessages();
        _assistantBubblesInTurn = [];
        _typingIndicator = null;
        _continueBtn = null;
        _hideRetryBar();

        _closeBubbleEditDialog();

        // 送信
        if (!Settings.isConfigured()) {
            openSettings();
            return;
        }
        SoundManager.play('user');
        _startStreaming();
    }

    /** アシスタントバブル: そこ以降を削除 */
    function _handleBubbleDelete() {
        if (_bubbleTapIndex === null) return;
        const idx = _bubbleTapIndex;
        const chunkIdx = _bubbleTapChunkIndex;

        const messages = ChatHistory.getAll();
        const msg = messages[idx];

        if (chunkIdx !== null && chunkIdx > 0 && msg) {
            // チャンク途中 → タップされたチャンクより前の部分だけ残す
            const chunks = _splitIntoChunks(msg.content);
            const kept = chunks.slice(0, chunkIdx).join('');
            if (kept.trim()) {
                ChatHistory.updateAt(idx, kept);
                // idx+1 以降を削除
                ChatHistory.truncateFrom(idx + 1);
            } else {
                // 残る内容がなければメッセージごと削除
                ChatHistory.truncateFrom(idx);
            }
        } else {
            // チャンク先頭 or チャンク情報なし → メッセージごと削除
            ChatHistory.truncateFrom(idx);
        }

        // DOM を再描画
        _renderAllMessages();
        _assistantBubblesInTurn = [];
        _typingIndicator = null;
        _continueBtn = null;
        _hideRetryBar();

        _closeBubbleDeleteDialog();
    }

    // ─── Settings Dialog ───
    function openSettings() {
        const s = Settings.get();
        _originalTheme = s.theme || 'gb';
        document.getElementById('setting-baseurl').value = s.baseUrl;
        document.getElementById('setting-apikey').value = s.apiKey;
        document.getElementById('setting-model').value = s.model;
        document.getElementById('setting-systemprompt').value = s.systemPrompt;
        document.getElementById('setting-font').value = s.font;
        document.getElementById('setting-theme').value = s.theme || 'gb';
        document.getElementById('setting-autoadvance').checked = s.autoAdvance;
        document.getElementById('setting-sound').checked = s.soundEnabled;
        document.getElementById('setting-scanline').checked = s.scanlineEffect;
        document.getElementById('setting-chardelay').value = s.charDelayMs;
        document.getElementById('setting-mindelay').value = s.minDelaySec;
        document.getElementById('setting-contextsize').value = s.contextSize;
        document.getElementById('setting-quickresponses').value = s.quickResponses || '';
        settingsOverlay.classList.remove('hidden');
    }

    function closeSettings() {
        // テーマを元に戻す
        if (_originalTheme !== null) {
            const theme = _originalTheme;
            if (theme === 'gb') {
                document.documentElement.removeAttribute('data-theme');
            } else {
                document.documentElement.setAttribute('data-theme', theme);
            }
            _originalTheme = null;
        }
        settingsOverlay.classList.add('hidden');
    }

    function _handleThemePreview() {
        const theme = document.getElementById('setting-theme').value;
        if (theme === 'gb') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }

    function _handleSaveSettings(e) {
        e.preventDefault();
        Settings.save({
            baseUrl: document.getElementById('setting-baseurl').value.trim(),
            apiKey: document.getElementById('setting-apikey').value.trim(),
            model: document.getElementById('setting-model').value.trim(),
            systemPrompt: document.getElementById('setting-systemprompt').value.trim(),
            font: document.getElementById('setting-font').value,
            theme: document.getElementById('setting-theme').value,
            autoAdvance: document.getElementById('setting-autoadvance').checked,
            soundEnabled: document.getElementById('setting-sound').checked,
            scanlineEffect: document.getElementById('setting-scanline').checked,
            charDelayMs: parseInt(document.getElementById('setting-chardelay').value, 10) || 50,
            minDelaySec: parseFloat(document.getElementById('setting-mindelay').value) || 0,
            contextSize: parseInt(document.getElementById('setting-contextsize').value, 10) || 20,
            quickResponses: document.getElementById('setting-quickresponses').value,
        });
        Settings.applyFont();
        Settings.applyTheme();
        Settings.applyScanline();
        _renderQuickResponses();
        _originalTheme = null;

        // ストリーミング中に autoAdvance が変更された場合の即時反映
        if (_isStreaming) {
            const s = Settings.get();
            if (s.autoAdvance) {
                _removeContinueButton();
                TypingSimulator.switchToAutoAdvance();
                _showTypingIndicator();
            } else {
                _removeTypingIndicator();
                TypingSimulator.switchToManualAdvance();
            }
        }

        closeSettings();
    }

    return { init, openSettings, closeSettings };
})();

// ────────────────────────────────────────────────────────────
// Boot
// ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    UIController.init();
});
