# SlowDialog — 内部設計書

## 概要

SlowDialogは、AIとの会話の主体を人間に取り戻すためのチャットアプリケーション。
AIの返答を一気に表示せず、人間がタイピングしているかのようにチャンク単位で遅延表示する。

- **技術スタック**: HTML5 + Vanilla CSS + Vanilla JavaScript（フレームワーク不使用）
- **API**: OpenAI互換 ChatCompletion API（SSEストリーミング）
- **永続化**: localStorage
- **フォント**: k8x12系（ピクセルフォント）/ 美咲ゴシック / Noto Sans JP
- **多言語**: 日本語 / English

## ファイル構成

```
slowdialog/
├── index.html          # SPA のエントリポイント（日本語）
├── index_en.html       # SPA のエントリポイント（英語）
├── style.css           # 全スタイル定義
├── app.js              # 全ロジック（8モジュール）
├── DIRECTION.md        # 企画書
├── ARCHITECTURE.md     # 本ファイル
├── README.md           # ドキュメント（日本語）
├── README_EN.md        # ドキュメント（英語）
├── fonts/
│   ├── littlelimit/
│   │   ├── k8x12.ttf           # k8x12 オリジナル
│   │   ├── k8x12L.ttf          # k8x12L（縦長仮名）
│   │   ├── k8x12S.ttf          # k8x12S（8dot非漢字）
│   │   ├── misaki_gothic.ttf   # 美咲ゴシック
│   │   └── LICENSE
│   └── notosansjp/
│       ├── NotoSansJP-VariableFont_wght.ttf
│       └── OFL.txt
└── sound/
    ├── user.wav            # ユーザー送信音
    ├── assistant.wav       # AI応答音
    └── assistant_end.wav   # AI応答完了音
```

## モジュール構成 (app.js)

app.js は IIFE パターンで 8 つのモジュールに分割されている。
モジュール間の依存関係は一方向で、循環依存はない。

```
┌──────────────┐
│ UIController │  ← エントリポイント（Boot から init() を呼出）
└──┬──┬──┬──┬──┬──┬──┘
   │  │  │  │  │  │
   │  │  │  │  │  └──▶ Lang              多言語対応
   │  │  │  │  └─────▶ SoundManager      効果音再生
   │  │  │  └────────▶ TypingSimulator   チャンク遅延表示
   │  │  └───────────▶ ApiClient         SSE ストリーミング
   │  └──────────────▶ ChatHistory       履歴管理・永続化
   └─────────────────▶ Settings          設定管理・永続化
                       SimpleMarkdown    Markdown → HTML 変換
```

---

## 各モジュール詳細

### 1. Lang

多言語対応を提供するモジュール。HTMLの `lang` 属性から言語を判定し、UIテキストを提供する。

**サポート言語:**
- `ja` — 日本語（デフォルト）
- `en` — English

**主要メソッド:**
- `current()` — 現在の言語コードを返す（`'ja'` or `'en'`）
- `t(key)` — 指定キーの翻訳テキストを返す

**翻訳キー例:**
- `defaultSystemPrompt` — システムプロンプトのデフォルト値
- `continueButton` — 「続きを読む ▼」/ "Continue ▼"
- `bubbleUserAction`, `bubbleResend`, `bubbleEdit`, etc.

### 2. Settings

設定の読み書き、フォント・テーマ・スキャンライン効果の適用を担う。

| キー | 型 | デフォルト | 説明 |
|------|-----|-----------|------|
| `baseUrl` | string | `https://openrouter.ai/api/v1` | API ベース URL |
| `apiKey` | string | `""` | API キー |
| `model` | string | `google/gemini-3-flash-preview` | モデル名 |
| `systemPrompt` | string | 言語依存 | システムプロンプト |
| `charDelayMs` | number | `150` | 1文字あたりの待ち時間(ms) |
| `minDelaySec` | number | `2` | チャンク間の最小待ち時間（秒） |
| `contextSize` | number | `20` | API送信する履歴メッセージ数 |
| `font` | string | `k8x12S` | 使用フォントキー |
| `theme` | string | `gb` | カラーテーマ |
| `autoAdvance` | boolean | `true` | 自動進行モード |
| `soundEnabled` | boolean | `true` | 効果音を有効にするか |
| `scanlineEffect` | boolean | `false` | スキャンライン効果 |
| `scanlineStrength` | number | `2` | スキャンライン強度（%） |
| `sendTimestamp` | boolean | `false` | タイムスタンプをAPIに送信するか |
| `quickResponses` | string | 言語依存 | クイックレスポンス（改行区切り） |

**主要メソッド:**

- `load()` — localStorage から読み込み、DEFAULTS とマージ
- `save(s)` — 設定を保存
- `get()` — 現在の設定オブジェクトのコピーを返す
- `isConfigured()` — baseUrl, apiKey, model が設定済みか
- `applyFont()` — `FONT_MAP` を参照して CSS変数 `--app-font` を更新
- `applyTheme()` — テーマを `data-theme` 属性に反映
- `applyScanline()` — スキャンライン効果のクラスと強度を適用

**FONT_MAP:**

```
k8x12S       → 'k8x12S', monospace
k8x12        → 'k8x12', monospace
k8x12L       → 'k8x12L', monospace
MisakiGothic → 'MisakiGothic', monospace
NotoSansJP   → 'Noto Sans JP', sans-serif
```

**テーマ:**
- `gb` — GBクラシック（デフォルト）
- `gb-inv` — GBクラシック反転
- `red`, `red-inv` — レッド系
- `amber`, `amber-inv` — アンバー系
- `green`, `green-inv` — グリーン系
- `blue`, `blue-inv` — ブルー系

---

### 3. SimpleMarkdown

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

### 4. ChatHistory

会話履歴の CRUD と永続化。

**データ構造:**
```js
_messages = [
  { role: "user"|"assistant"|"system", content: string, timestamp: string },
  ...
]
```

**主要メソッド:**

| メソッド | 説明 |
|---------|------|
| `push(role, content)` | メッセージ追加（タイムスタンプ自動付与） → トリム → 保存 |
| `updateLast(content)` | 最後のメッセージの content を上書き → 保存 |
| `updateAt(index, content)` | 指定インデックスのメッセージを更新 → 保存 |
| `popLast()` | 最後のメッセージを削除 → 保存 |
| `peekLast()` | 最後のメッセージを参照（破壊しない） |
| `truncateFrom(index)` | 指定インデックス以降のメッセージを削除 → 保存 |
| `buildApiMessages()` | system プロンプトを先頭に付けた API 送信用配列を生成 |
| `exportJSON()` | クイックレスポンス設定を含めた Blob + ダウンロードリンクで JSON エクスポート |
| `importJSON(data)` | JSON データから履歴をインポート（クイックレスポンスも含む） |

**タイムスタンプ送信:** `sendTimestamp` が有効な場合、APIに送信するメッセージに `<timestamp>` タグを付与。

**トリム:** `push()` 時に `contextSize` を超えたら先頭から削除。

---

### 5. ApiClient

OpenAI互換 ChatCompletion API への SSE ストリーミング通信。

**`streamChat(messages, { onChunk, onDone, onError })`**

1. `AbortController` を生成して前回のリクエストをキャンセル可能にする
2. Fetch API で POST リクエスト（`stream: true`）
3. `ReadableStream` を行単位で読み取り
4. `data: ` プレフィックスの行から `choices[0].delta.content` を抽出
5. `[DONE]` で完了通知

**`abort()`** — 現在のストリームを AbortController で中断。

---

### 6. TypingSimulator

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

**モード切替:**
- `switchToAutoAdvance()` — 手動→自動切替時、キューをバッファに戻して進行再開
- `switchToManualAdvance()` — 自動→手動切替時、タイマー停止

---

### 7. SoundManager

効果音の再生を管理するモジュール。

**効果音ファイル:**
- `user.wav` — ユーザーメッセージ送信時
- `assistant.wav` — AIチャンク表示時
- `assistant_end.wav` — AI応答完了時

**主要メソッド:**
- `play(name)` — 指定された効果音を再生（`soundEnabled` が有効な場合のみ）

**実装:**
- `Audio` オブジェクトをキャッシュして再利用
- autoplay ブロックに対応

---

### 8. UIController

DOM操作・イベント管理・各モジュールの統合を担う最上位モジュール。

#### 初期化フロー

```
DOMContentLoaded
  → UIController.init()
      → Settings.load() / applyFont() / applyTheme() / applyScanline()
      → ChatHistory.load()
      → _renderAllMessages()
      → _bindEvents()
      → _renderQuickResponses()
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
                      → SoundManager.play('user')
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
      → タイムスタンプ表示
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
- タイムスタンプは最後のチャンクの後に表示

#### 履歴復元（`_renderAllMessages`）

ページ読み込み時、保存済み履歴を復元表示。
assistant メッセージは `_splitIntoChunks()` で分割し、実行時と同じマルチバブル表示を再現。

#### クイックレスポンス

- 設定の `quickResponses` を改行区切りでパース
- 入力エリア上部にボタンとして表示
- クリックで即座にそのテキストを送信

#### メッセージ編集・削除

- ユーザーバブルタップ → 再送信/編集ダイアログ
  - 再送信: そのメッセージ以降を削除して再送信
  - 編集: そのメッセージを編集して再送信
- アシスタントバブルタップ → 削除確認ダイアログ
  - 削除: そのメッセージ以降を履歴から削除
  - チャンク途中の場合はそのチャンク以降を削除

#### インポート/エクスポート

- エクスポート: クイックレスポンス、システムプロンプト、会話履歴を JSON でダウンロード
- インポート: JSON ファイルまたはテキスト貼り付けで履歴を復元
  - `_quickresponse` エントリがあれば設定に反映
  - `system` エントリがあれば設定に反映

#### 設定プレビュー

- テーマ変更時、即座にプレビュー
- キャンセル時は元のテーマに戻す
- スキャンライン効果も同様

---

## UI 構成 (index.html / index_en.html)

```
<body>
  <header id="toolbar">        ← タイトル + 設定/エクスポート/インポート/クリアボタン
  <main id="chat-area">         ← スクロール領域
    <div id="chat-messages">    ← バブル・インジケータの親
  <div id="quick-responses">    ← クイックレスポンスボタンエリア
  <footer id="input-area">      ← テキストエリア + 送信ボタン
  <div id="settings-overlay">   ← 設定ダイアログ（モーダル）
  <div id="intro-overlay">      ← イントロダイアログ（初回のみ）
  <div id="retry-bar">          ← エラー時リトライバー
  <div id="import-overlay">     ← インポートダイアログ
  <div id="confirm-overlay">    ← クリア確認ダイアログ
  <div id="bubble-action-overlay"> ← メッセージアクションダイアログ
  <div id="bubble-edit-overlay">   ← メッセージ編集ダイアログ
  <div id="bubble-delete-overlay"> ← メッセージ削除確認ダイアログ
```

## CSS 設計 (style.css)

**カラーパレット（ゲームボーイ風4色）:**

| 変数 | GBクラシック | 用途 |
|------|-----|------|
| `--gb-darkest` | `#0f380f` | テキスト, ボーダー |
| `--gb-dark` | `#306230` | ツールバー背景, ユーザーバブル |
| `--gb-light` | `#8bac0f` | AIバブル背景 |
| `--gb-lightest` | `#9bbc0f` | ページ背景 |

**テーマ:**
- `[data-theme="red"]` — レッド系カラー
- `[data-theme="red-inv"]` — レッド反転
- `[data-theme="amber"]` — アンバー系
- `[data-theme="amber-inv"]` — アンバー反転
- `[data-theme="green"]` — グリーン系
- `[data-theme="green-inv"]` — グリーン反転
- `[data-theme="blue"]` — ブルー系
- `[data-theme="blue-inv"]` — ブルー反転
- `[data-theme="gb-inv"]` — GBクラシック反転

**スキャンライン効果:**
- `.scanline-on::after` — 画面全体にスキャンラインアニメーションを適用
- `--scanline-strength` — スキャンラインの不透明度（0.0〜0.1程度）

**レイアウト:**
- `body` に `max-width: 800px` + `margin: 0 auto` でPC上でもスマホ風の幅
- `html` 背景は `#0a2a0a`（暗い緑）で周囲を暗くし、コンテンツが浮いて見える
- フレックスボックスで縦3段構成（ツールバー / チャット / 入力）

**フォント切り替え:**
- CSS変数 `--app-font` を JavaScript から動的に変更
- 全要素が `var(--app-font)` を参照

**動的要素のCSS:**
- `.msg` — チャットバブル（出現アニメーション付き）
- `.msg-timestamp` — タイムスタンプ表示
- `.typing-indicator` — ドットバウンスアニメーション
- `.continue-btn` — 手動モード時の「続きを読む」ボタン
- `.quick-response-btn` — クイックレスポンスボタン
- `.msg.assistant` 内の Markdown 要素スタイリング

## localStorage キー

| キー | 内容 |
|------|------|
| `slowdialog_settings` | 設定 JSON |
| `slowdialog_history` | 会話履歴 JSON（タイムスタンプ含む） |
| `slowdialog_intro_seen` | イントロ表示済みフラグ（`"1"`） |
