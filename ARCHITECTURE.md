# SlowDialog — 内部設計書

## 概要

SlowDialogは、AIとの会話の主体を人間に取り戻すためのチャットアプリケーション。
AIの返答を一気に表示せず、人間がタイピングしているかのようにチャンク単位で遅延表示する。

- **技術スタック**: HTML5 + Vanilla CSS + Vanilla JavaScript（フレームワーク不使用）
- **API**: OpenAI互換 ChatCompletion API（SSEストリーミング）
- **永続化**: localStorage
- **フォント**: k8x12系（ピクセルフォント）/ 美咲ゴシック / Noto Sans JP

## ファイル構成

```
slowdialog/
├── index.html          # SPA のエントリポイント
├── style.css           # 全スタイル定義
├── app.js              # 全ロジック（6モジュール）
├── DIRECTION.md        # 企画書
├── ARCHITECTURE.md     # 本ファイル
└── fonts/
    ├── k8x12.ttf       # k8x12 オリジナル
    ├── k8x12L.ttf      # k8x12L（縦長仮名）
    ├── k8x12S.ttf      # k8x12S（8dot非漢字）
    └── misaki_gothic.ttf  # 美咲ゴシック
```

## モジュール構成 (app.js)

app.js は IIFE パターンで 6 つのモジュールに分割されている。
モジュール間の依存関係は一方向で、循環依存はない。

```
┌──────────────┐
│ UIController │  ← エントリポイント（Boot から init() を呼出）
└──┬──┬──┬──┬──┘
   │  │  │  │
   │  │  │  └──▶ TypingSimulator   チャンク遅延表示
   │  │  └─────▶ ApiClient         SSE ストリーミング
   │  └────────▶ ChatHistory       履歴管理・永続化
   └───────────▶ Settings          設定管理・永続化
                 SimpleMarkdown    Markdown → HTML 変換
```

---

## 各モジュール詳細

### 1. Settings

設定の読み書きとフォント適用を担う。

| キー | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `baseUrl` | string | `https://openrouter.ai/api/v1` | API ベース URL |
| `apiKey` | string | `""` | API キー |
| `model` | string | `google/gemini-3-flash-preview` | モデル名 |
| `systemPrompt` | string | `あなたは親切なアシスタントです。` | システムプロンプト |
| `charDelayMs` | number | `150` | 1文字あたりの待ち時間(ms) |
| `contextSize` | number | `20` | API送信する履歴メッセージ数 |
| `font` | string | `k8x12S` | 使用フォントキー |
| `autoAdvance` | boolean | `true` | 自動進行モード |

**主要メソッド:**

- `load()` — localStorage から読み込み、DEFAULTS とマージ
- `save(s)` — 設定を保存
- `get()` — 現在の設定オブジェクトのコピーを返す
- `isConfigured()` — baseUrl, apiKey, model が設定済みか
- `applyFont()` — `FONT_MAP` を参照して CSS変数 `--app-font` を更新

**FONT_MAP:**

```
k8x12S       → 'k8x12S', monospace
k8x12        → 'k8x12', monospace
k8x12L       → 'k8x12L', monospace
MisakiGothic → 'MisakiGothic', monospace
NotoSansJP   → 'Noto Sans JP', sans-serif
```

---

### 2. SimpleMarkdown

AIメッセージ内の Markdown を HTML に変換する軽量パーサ。

**サポート書式:**

| 記法 | 出力 |
|------|------|
| `# 見出し` / `##` / `###` | `<h3>` / `<h4>` / `<h5>` |
| `**太字**` | `<strong>` |
| `*斜体*` | `<em>` |
| `` `code` `` | `<code>` |
| ```` ``` ```` コードブロック | `<pre><code>` |
| `- リスト` / `* リスト` | `<ul><li>` |

**除外ルール:**
- `---` / `***` / `___` （水平線）→ チャット形式では邪魔になるためスキップ

**処理順序:**
1. コードブロック（` ``` `）をプレースホルダに置換して保護
2. インラインコード（`` ` ``）をプレースホルダに置換して保護
3. 行ごとに処理: 水平線→見出し→リスト→空行→通常行
4. インライン書式適用（`**bold**`, `*italic*`）
5. プレースホルダを復元

**セキュリティ:** `_escapeHtml()` で `&`, `<`, `>`, `"` をエスケープ。
ユーザーメッセージには適用しない（textContent で表示）。

---

### 3. ChatHistory

会話履歴の CRUD と永続化。

**データ構造:**
```js
_messages = [ { role: "user"|"assistant"|"system", content: string }, ... ]
```

**主要メソッド:**

| メソッド | 説明 |
|---------|------|
| `push(role, content)` | メッセージ追加 → トリム → 保存 |
| `updateLast(content)` | 最後のメッセージの content を上書き → 保存 |
| `popLast()` | 最後のメッセージを削除 → 保存 |
| `peekLast()` | 最後のメッセージを参照（破壊しない） |
| `buildApiMessages()` | system プロンプトを先頭に付けた API 送信用配列を生成 |
| `exportJSON()` | Blob + ダウンロードリンクで JSON エクスポート |

**トリム:** `push()` 時に `contextSize` を超えたら先頭から削除。

---

### 4. ApiClient

OpenAI互換 ChatCompletion API への SSE ストリーミング通信。

**`streamChat(messages, { onChunk, onDone, onError })`**

1. `AbortController` を生成して前回のリクエストをキャンセル可能にする
2. Fetch API で POST リクエスト（`stream: true`）
3. `ReadableStream` を行単位で読み取り
4. `data: ` プレフィックスの行から `choices[0].delta.content` を抽出
5. `[DONE]` で完了通知

**`abort()`** — 現在のストリームを AbortController で中断。

---

### 5. TypingSimulator

AI返答テキストを句読点・改行で区切り、人間がタイピングしているかのように遅延表示する。

**チャンク分割ルール（`_extractNextChunk`）:**
- `。` または `. `（ピリオド+スペース）で区切る
- `\n`（改行）で区切る（ただし先頭改行は無視）
- 上記に一致しない場合はバッファに保持し、次の `feed()` を待つ

**動作モード:**

#### 自動進行モード（`autoAdvance: true`）

```
feed(text) → _tryFlush() → _extractNextChunk()
    → _scheduleDisplay(chunk)
        → setTimeout(charDelayMs × chunk.length)
            → onDisplayChunk(chunk, fullText)
            → _tryFlush()  [再帰的に次のチャンクへ]
```

- チャンク間にタイピングインジケータ（ドットアニメーション）を表示

#### 手動進行モード（`autoAdvance: false`）

```
feed(text) → _tryFlush() → _extractNextChunk()
    → _scheduleDisplay(chunk)
        ├─ [1st chunk] → 自動表示（ボタン不要）
        └─ [2nd+]     → _manualQueue に追加
                       → onWaitManual() [「続きを読む」ボタン表示]

[ボタンクリック]
    → resumeManual()
        → _manualQueue.shift() → onDisplayChunk()
        → _tryFlush() [キューへの追加抽出]
        → hasMoreChunks() ? ボタン再表示 : 終了
```

**キューイング:** ストリーム中に到着するチャンクはすべて `_manualQueue` に積まれる。
ボタン待ち中（`_manualWaiting = true`）でも `_tryFlush` はバッファからキューへ移し続ける。

**割り込み（`interrupt()`）:**
- タイマークリア、キュークリア、`_manualWaiting` リセット
- 表示済みテキスト `_displayedText` を返す

---

### 6. UIController

DOM操作・イベント管理・各モジュールの統合を担う最上位モジュール。

#### 初期化フロー

```
DOMContentLoaded
  → UIController.init()
      → Settings.load() / applyFont()
      → ChatHistory.load()
      → _renderAllMessages()
      → _bindEvents()
      → 初回起動判定:
          introSeen なし → イントロダイアログ表示
          introSeen あり & 未設定 → 設定ダイアログ表示
```

#### メッセージ送信フロー

```
_handleSend()
  ├─ ストリーム中 → _performInterrupt(text)
  └─ 通常        → _sendNewMessage(text)
                      → ChatHistory.push('user', text)
                      → _appendBubble('user', text)
                      → _startStreaming()
```

#### ストリーミングフロー（`_startStreaming`）

```
_startStreaming()
  → ChatHistory.push('assistant', '')  [仮エントリ]
  → TypingSimulator.start(onDisplayChunk, onAllDone, onWaitManual)
  → ApiClient.streamChat(...)
      onChunk → TypingSimulator.feed()
      onDone  → TypingSimulator.finish()
      onError → _showRetryBar()
```

#### 割り込みフロー（`_performInterrupt`）

```
_performInterrupt(newText)
  → ApiClient.abort()
  → TypingSimulator.interrupt() → displayedText
  → 表示済みテキストがある:
      → ChatHistory.updateLast(displayedText)
  → 表示済みテキストがない:
      → ChatHistory.popLast() [assistant エントリ削除]
      → バブルDOM削除
  → 直前が user メッセージ:
      → メッセージ連結（改行区切り）
  → それ以外:
      → 新規 user メッセージ追加
  → _startStreaming() [再開]
```

#### 表示チャンク処理

- 各チャンクは **個別のチャットバブル** として追加（`_appendBubble`）
- assistant メッセージは `SimpleMarkdown.render()` で HTML 変換して `innerHTML` に設定
- user メッセージは `textContent` で設定（XSS対策）

#### 履歴復元（`_renderAllMessages`）

ページ読み込み時、保存済み履歴を復元表示。
assistant メッセージは `_splitIntoChunks()` で分割し、実行時と同じマルチバブル表示を再現。

---

## UI 構成 (index.html)

```
<body>
  <header id="toolbar">        ← タイトル + 設定/エクスポート/クリアボタン
  <main id="chat-area">         ← スクロール領域
    <div id="chat-messages">    ← バブル・インジケータの親
  <footer id="input-area">      ← テキストエリア + 送信ボタン
  <div id="settings-overlay">   ← 設定ダイアログ（モーダル）
  <div id="intro-overlay">      ← イントロダイアログ（初回のみ）
  <div id="retry-bar">          ← エラー時リトライバー
```

## CSS 設計 (style.css)

**カラーパレット（ゲームボーイ風4色）:**

| 変数 | 色 | 用途 |
|------|-----|------|
| `--gb-darkest` | `#0f380f` | テキスト, ボーダー |
| `--gb-dark` | `#306230` | ツールバー背景, ユーザーバブル |
| `--gb-light` | `#8bac0f` | AIバブル背景 |
| `--gb-lightest` | `#9bbc0f` | ページ背景 |

**レイアウト:**
- `body` に `max-width: 800px` + `margin: 0 auto` でPC上でもスマホ風の幅
- `html` 背景は `#0a2a0a`（暗い緑）で周囲を暗くし、コンテンツが浮いて見える
- フレックスボックスで縦3段構成（ツールバー / チャット / 入力）

**フォント切り替え:**
- CSS変数 `--app-font` を JavaScript から動的に変更
- 全要素が `var(--app-font)` を参照

**動的要素のCSS:**
- `.msg` — チャットバブル（出現アニメーション付き）
- `.typing-indicator` — ドットバウンスアニメーション
- `.continue-btn` — 手動モード時の「続きを読む」ボタン
- `.msg.assistant` 内の Markdown 要素スタイリング

## localStorage キー

| キー | 内容 |
|------|------|
| `slowdialog_settings` | 設定 JSON |
| `slowdialog_history` | 会話履歴 JSON |
| `slowdialog_intro_seen` | イントロ表示済みフラグ（`"1"`） |
