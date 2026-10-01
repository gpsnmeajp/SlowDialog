# SlowDialog — 内部設計書

## 概要

SlowDialogは、AIとの会話の主体を人間に取り戻すためのチャットアプリケーション。
AIの返答を一気に表示せず、人間がタイピングしているかのようにチャンク単位で遅延表示する。

- **技術スタック**: HTML5 + Vanilla CSS + Vanilla JavaScript（フレームワーク不使用）
- **API**: OpenAI互換 ChatCompletion API（SSEストリーミング）、System One API（意図判定）
- **永続化**: localStorage
- **フォント**: k8x12系（ピクセルフォント）/ 美咲ゴシック / Noto Sans JP
- **多言語**: 日本語 / English

## ファイル構成

```
slowdialog/
├── index.html          # SPA のエントリポイント（日本語）
├── index_en.html       # SPA のエントリポイント（英語）
├── style.css           # 全スタイル定義
├── app.js              # 全ロジック
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

app.js は IIFE パターンで 複数のモジュールに分割されている。
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
                       SpeechClient      音声エンジン選択（VoiceVoxClient / IrodoriClient / OpenRouterTtsClient）
                       SpeechAudio       共通の再生・テキスト正規化
                       SimpleMarkdown    Markdown → HTML 変換
                       SystemOneIntent   意図判定とプレビュー
                       IntentChoices     日英の既定選択肢
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
| `intentEnabled` | boolean | `false` | 意図判定の有効可否 |
| `intentBaseUrl` | string | `https://openrouter.ai/api` | System One APIのBase URL |
| `intentApiKey` | string | `""` | 意図判定用APIキー |
| `intentModel` | string | `~typesafe/jev-latest` | 判定モデル |
| `intentDelay` | number | `0.5` | 判定遅延（秒） |
| `intentConfidence` | number | `0.65` | 判定不能のしきい値(Confidence) |
| `intentChoices` | string | 日英106種類 | 改行区切りの選択肢 |
| `intentInstructions` | string | `""` | 共通判定指示への追加情報 |
| `intentTracking` | boolean | `false` | 直近3ターンを含める |
| `appMode` | string | `chat` | `chat` または `textCall` のUIモード |
| `baseUrl` | string | `https://openrouter.ai/api/v1` | API ベース URL |
| `apiKey` | string | `""` | API キー |
| `model` | string | `google/gemini-3-flash-preview` | モデル名 |
| `systemPrompt` | string | 言語依存 | システムプロンプト |
| `charDelayMs` | number | `150` | 1文字あたりの待ち時間(ms) |
| `minDelaySec` | number | `2` | チャンク間の最小待ち時間（秒） |
| `contextSize` | number | `20` | API送信する履歴メッセージ数 |
| `font` | string | `k8x12S` | 使用フォントキー |
| `theme` | string | `gb` | カラーテーマ |
| `backgroundImageId` | string / null | `null` | IndexedDBに保存した背景画像のID |
| `backgroundPositionX` | number | `0.5` | 横方向の切り出し可能範囲に対する位置（0〜1） |
| `backgroundPositionY` | number | `0.5` | 縦方向の切り出し可能範囲に対する位置（0〜1） |
| `backgroundTransparency` | number | `0` | 背景画像の透明度（0〜100%） |
| `autoAdvance` | boolean | `true` | 自動進行モード |
| `splitInsideQuotes` | boolean | `false` | かぎ括弧・二重かぎ括弧内のチャンク分割を許可するか |
| `soundEnabled` | boolean | `true` | 効果音を有効にするか |
| `voicevoxEnabled` | boolean | `false` | VOICEVOX音声合成を有効にするか |
| `deepgramEnabled` | boolean | `false` | Deepgram音声認識を有効化（音声合成と独立） |
| `deepgramApiKey` | string | `''` | 音声認識専用のAPIキー |
| `deepgramModel` | string | `'nova-3'` | v1ストリーミングモデルID（手入力可・空欄時は既定値） |
| `deepgramLanguage` | string | `Lang.current()` | `ja` / `en` / `multi` |
| `openrouterSttEnabled` | boolean | `false` | OpenRouter STTを有効化（Deepgramと排他、音声合成とは独立） |
| `openrouterSttBaseUrl` | string | `'https://openrouter.ai/api/v1'` | 文字起こしAPIのBase URL |
| `openrouterSttApiKey` | string | `''` | STT専用Bearer認証キー |
| `openrouterSttModel` | string | `'openai/whisper-1'` | STTモデルID（手入力可） |
| `openrouterSttLanguage` | string | `Lang.current()` | `ja` / `en` / `''`（自動判定） |
| `voicevoxUrl` | string | `http://localhost:50021` | VOICEVOX Engine URL |
| `voicevoxSpeaker` | number | `3` | VOICEVOX話者ID |
| `voicevoxSpeakers` | array | `[]` | 取得済み話者リスト |
| `voicevoxSpeedScale` | number | `1` | VOICEVOX話速 |
| `voicevoxPitchScale` | number | `0` | VOICEVOX音高 |
| `voicevoxIntonationScale` | number | `1` | VOICEVOX抑揚 |
| `voicevoxVolumeScale` | number | `1` | VOICEVOX音量 |
| `voicevoxPrePhonemeLength` | number | `0.1` | VOICEVOX開始無音 |
| `voicevoxPostPhonemeLength` | number | `0.1` | VOICEVOX終了無音 |
| `voicevoxSkipAnnotations` | boolean | `true` | ルビや括弧内補足をVOICEVOX読み上げから除外するか |
| `irodoriEnabled` | boolean | `false` | Irodori音声合成を有効化（他の音声エンジンと排他） |
| `irodoriUrl` | string | `http://localhost:8088` | サーバーURL（末尾 `/v1` も可） |
| `irodoriApiKey` | string | `''` | 任意のBearer認証キー |
| `irodoriModel` | string | `irodori-tts` | サーバーのモデルID |
| `irodoriVoice` | string | `none` | 話者ID。空文字はサーバーの既定話者 |
| `irodoriVoices` | array | `[]` | 取得済み話者リスト |
| `irodoriSpeed` | number | `1` | 話速（0.25〜4） |
| `irodoriCaption` | string | `''` | 任意の声・話し方の説明 |
| `irodoriNumSteps` | number/null | `null` | 生成ステップ数。nullは送信しない |
| `irodoriSeed` | number/null | `null` | シード。nullは送信しない（0は有効） |
| `irodoriSkipAnnotations` | boolean | `true` | ルビ・括弧内補足を読み飛ばす |
| `openrouterTtsEnabled` | boolean | `false` | OpenRouter音声合成を有効化（他の音声エンジンと排他） |
| `openrouterTtsBaseUrl` | string | `https://openrouter.ai/api/v1` | 音声合成APIのベースURL（末尾のスラッシュは除去） |
| `openrouterTtsApiKey` | string | `''` | 音声合成専用のBearer認証キー |
| `openrouterTtsModel` | string | `google/gemini-3.8-flash-tts` | 手入力の音声モデルID |
| `openrouterTtsVoice` | string | `Zephyr` | モデルに対応する話者ID |
| `openrouterTtsResponseFormat` | string | `pcm` | 取得形式（pcm / mp3） |
| `openrouterTtsSpeed` | number | `1` | 話速（UI範囲0.25〜4、対応はモデルに依存） |
| `openrouterTtsSkipAnnotations` | boolean | `true` | ルビ・括弧内補足を読み飛ばす |
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
  { role: "user"|"assistant"|"system", content: string, timestamp: string,
    intents?: [{ end: number, label: string }] },
  ...
]
```

**主要メソッド:**

| メソッド | 説明 |
|---------|------|
| `push(role, content, intent)` | メッセージ追加（タイムスタンプ自動付与） → トリム → 保存 |
| `appendUser(content, intent)` | 最後のユーザー発言へ改行で連結し、タグの境界を保持 |
| `subscribe(listener)` | 保存時に履歴変更を通知 |
| `updateLast(content)` | 最後のメッセージの content を上書き → 保存 |
| `updateAt(index, content)` | 指定インデックスのメッセージを更新 → 保存 |
| `popLast()` | 最後のメッセージを削除 → 保存 |
| `peekLast()` | 最後のメッセージを参照（破壊しない） |
| `truncateFrom(index)` | 指定インデックス以降のメッセージを削除 → 保存 |
| `buildApiMessages()` | system プロンプトを先頭に付けた API 送信用配列を生成 |
| `exportJSON()` | クイックレスポンス設定を含めた Blob + ダウンロードリンクで JSON エクスポート |
| `importJSON(data)` | JSON データから履歴をインポート（クイックレスポンスも含む） |

**意図タグ:** `content`はタグなしの本文。`intents`は各発言の末尾位置（JavaScript文字列のUTF-16オフセット）とラベルを保持する。API送信時だけ各位置に` [label]`を挿入し、画面ではラベルを時刻の左へ表示する。割り込み時も1件のユーザーメッセージへ連結する。本文の全面置換では既存のタグ境界を破棄する。JSONエクスポート・インポートでも`intents`を保持する。

**タイムスタンプ送信:** `sendTimestamp` が有効な場合、APIに送信するメッセージに `<timestamp>` タグを付与。

**トリム:** `push()` 時に `contextSize` を超えたら先頭から削除。

**上限リマインダー:** `ContextLimitReminder` は履歴が `contextSize` 以上になった後の次の送信で、履歴や入力を変更する前に確認ダイアログを表示する。「送信」を選んだ後は同じ会話で繰り返さず、キャンセルやEscの場合は次の送信時にも確認する。通常送信・割り込み・定型入力・編集・再送信・リトライ・通話開始に適用。確認済み状態はメモリ内だけで保持し、ページ再読み込み、履歴ロード・クリア・インポート、設定保存による上限増加でリセットする。上限の維持・減少、通常の履歴更新や部分削除ではリセットしない。

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
- 全角・半角の丸括弧 `（…）` / `(…)` 内では常に上記の区切りを無視する（入れ子・全半角混在にも対応）
- かぎ括弧 `「…」` / 二重かぎ括弧 `『…』` 内も既定では区切らない（入れ子対応）。「会話」設定の「かぎ括弧内を分割する」（`splitInsideQuotes`）をオンにすると通常どおり区切る
- 分割を抑止する括弧が閉じるまで括弧内をバッファに保持する。閉じられないまま受信完了した場合は、残りを一つのチャンクとして送出する
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

### 音声認識（DeepgramClient / OpenRouterSttClient / VoiceInput）

- `DeepgramClient` は `getUserMedia` → `MediaRecorder`（250ms間隔）→ `wss://api.deepgram.com/v1/listen` を管理する。選択モデル（既定Nova-3）、選択言語、`smart_format=true`、`interim_results=true` を指定。APIキーは `['token', apiKey]` のWebSocketサブプロトコルで送信し、URLやエラー表示には含めない。コンテナー付き音声にはencoding/sample_rateを指定しない。
- 許可後は接続待ちの間も録音し、音声を最大1MiBまでバッファーする。送信待ちが上限を超える場合も停止する。WebSocket接続後は4秒ごとにKeepAliveを送る。
- 通常停止は最後の `dataavailable` → `stop` → `CloseStream` の順。録音トラックは即時停止し、ソケットは最終Resultsと正常切断まで維持する。許可待ちは30秒、接続待ちは10秒、停止後の確定待ちは5秒でタイムアウトする。エラーや取消ではトラック・レコーダー・ソケット・タイマーを破棄し、遅れて届いたマイク許可や認識結果も処理しない。
- `VoiceInput` はpointer captureとキーボードで短押しトグル／350ms以上のPTTを区別する。押下時に取得開始、長押し解放・pointercancel・押下中のフォーカス喪失で停止する。停止処理中は再開を抑止しつつ、キーボードフォーカスを保持する。
- 途中結果は入力欄で差し替え、確定結果は区間識別子で重複を除いて追記する。入力欄の文字列が変わる場合だけ `input` イベントで自動リサイズ・意図判定に反映する。空の結果や同一文字列の再通知・確定で意図判定の再実行や手動選択の解除は行わない。手入力、設定表示、通話待機、ページ非表示／pagehideで取消し、下書きは保持する。
- 送信時は直ちに録音を停止し、`VoiceInput.finish()` を待ってから下書きを取得する。確定待ちの連打を抑止し、タイムアウト時は自動送信せず表示済みの文字を残す。無効時は `microphone-controls` 全体を隠して高さも元に戻し、権限要求・通信を行わない。
- 仕様参照：[Streaming API](https://developers.deepgram.com/reference/speech-to-text/listen-streaming)、[CloseStream](https://developers.deepgram.com/docs/close-stream)、[モデルと言語](https://developers.deepgram.com/docs/models-languages-overview)。

`OpenRouterSttClient` は同じ `start/stop/cancel/done` インターフェースを提供する。WebSocketは使わず、MediaRecorderの全チャンクと最後のdataavailableを一つの録音としてBase64化し、`POST {baseUrl}/audio/transcriptions` に送る。JSONは `model`、`input_audio: {data, format}`、`response_format: 'json'`、任意の `language`。音声形式は実際のMIMEからwebm/ogg/m4a/wavを判定し、自動言語時はlanguageを省略する。返却された `text` を共通の確定結果形式に変換して入力欄へ追記する。

OpenRouter STTは録音20MiB・許可待ち30秒・停止から完了まで65秒に制限する。停止時は即時マイク解放し、最後の音声チャンクを待って送信する。取消／タイムアウトはAbortControllerでHTTPを中断し、遅延した許可・応答を無視する。HTTPエラーではキーや応答本文を表示せず、ステータスコードのみ添える。チェック変更・設定読み込み・保存で認識プロバイダーの排他を保証し、競合した保存値はOpenRouter STTを優先する。両方無効ならマイク行を隠す。[OpenRouter STT仕様](https://openrouter.ai/docs/guides/overview/multimodal/stt)。

### 8. 音声合成モジュール

**SpeechClient / SpeechAudio:** `SpeechClient.synthesize(text)` が有効な音声エンジンへ振り分ける。`SpeechAudio` が既存の再生処理と注釈除去を共通化し、`SpeechClient.play(url)` からも利用する。再生終了時にObject URLを解放する。全エンジン無効時は音声を生成しない。設定の読み込み・保存時にも排他状態を正規化する（競合時はOpenRouter、Irodori、VOICEVOXの順）。

音声設定は既存のチェックボックスとサブセクション表示を踏襲し、一方の有効化で他方を無効化する。保存・復元時も排他を保証し、両方trueの場合はIrodoriを優先する。エンジン固有のパラメータと話者リストは切り替えても保持する。

#### VoiceVoxClient

VOICEVOX Engine への接続、話者取得、音声合成を担当する。

**主要メソッド:**
- `testConnection(url)` — `/version` へ接続して疎通確認
- `fetchSpeakers(url)` — `/speakers` から話者/スタイル一覧を取得
- `synthesize(text)` — `/audio_query` → `/synthesis` の順でWAVを生成し、Object URLを返す
- `play(url)` — 生成済みObject URLをAudioで再生し、終了時に解放

**発話パラメータ:** `audio_query` の結果に `speedScale`, `pitchScale`, `intonationScale`, `volumeScale`, `prePhonemeLength`, `postPhonemeLength` を反映する。

**発話テキスト正規化:** `voicevoxSkipAnnotations` が有効な場合、VOICEVOXへ送る前にルビ表記と `()` / `（）` 内の補足を除去する。画面表示と履歴のテキストは変更しない。

---

#### IrodoriClient

[Aratako/Irodori-TTS-Server](https://github.com/Aratako/Irodori-TTS-Server) のAPIに接続する。

- `testConnection(overrides)` — 認証のある `/v1/models` で接続確認。
- `fetchVoices(overrides)` — `/v1/audio/voices` の `{ data: [...] }` から話者一覧を取得。話者欄はdatalist付きテキスト入力で、取得が未対応でも任意のIDを手入力できる。リストの取得・更新・失敗は入力済みIDを変更しない。
- `synthesize(text, overrides)` — `/v1/audio/speech` に `model`、`input`、`voice`、`response_format: "wav"`、`speed` を送り、Object URLを返す。空の話者IDは送信せずサーバーの既定値を使う。
- 受信した音声はOfflineAudioContextでデコードし、全チャンネルの全サンプルを調べる。ピークが0.0001（-80 dBFS）以下、または空レスポンスなら無音として最大3回再試行（初回を含め4回）。シードなどのリクエスト設定は保持する。音のあるBlobだけObject URLを生成し、上限到達時は既存のエラー処理へ渡して文字表示を続行する。HTTPエラーやデコード不能は無音リトライの対象外。
- `irodori.caption`、`irodori.num_steps`、`irodori.seed` は値が指定されている場合のみ送信する。
- APIキーがある場合だけBearerヘッダーを付ける。チャットAPIのキーは流用しない。
- 接続先はサーバールート／`/v1` の両方を許容し、プロキシのパス接頭辞を維持する。
- 発話テストには未保存のフォーム値を渡す。HTTP／通信エラーはVOICEVOXと同じステータス表示を使う。
- ブラウザーからの接続にはサーバー側の `IRODORI_CORS_ORIGINS` 設定が必要。

#### OpenRouterTtsClient

[OpenRouter TTS API](https://openrouter.ai/docs/guides/overview/multimodal/tts) または指定した互換APIに接続する。

- モデル・話者は手入力のみ。モデル一覧の取得・キャッシュは行わない。
- `synthesize(text, overrides)` — `{openrouterTtsBaseUrl}/audio/speech` に `model`、`input`、`voice`、選択した `response_format`（pcm / mp3）、`speed` を送り、音声BlobのObject URLを返す。形式の既定はPCM。Base URLの末尾のスラッシュを除去し、パス接頭辞は維持する。専用のURL・APIキーだけを使用する。
- 生PCMの応答（audio/pcm、audio/l16、audio/x-pcm、またはPCM要求時のapplication/octet-stream）は、24kHz・16bit little-endian・monoのWAVヘッダーを付けて共通の再生処理へ渡す。サンプルのバイト列は変更せず、奇数バイトの不完全なPCMはエラーにする。MP3や既にWAVの応答にはヘッダーを追加しない。[Gemini音声仕様](https://ai.google.dev/gemini-api/docs/speech-generation)に合わせたPCM条件で、異なるサンプルレートやチャンネル数の生PCMには非対応。
- 非成功HTTP応答・音声以外のContent-Type・空の音声をエラーにする。自動再試行は行わず、チャットでは既存のエラー処理で文字表示を続行する。
- 発話テストは未保存のフォーム値を使う。通常再生・不要な合成結果の破棄は共通のSpeechClient/TypingSimulator経由で処理する。

### 9. IntentChoices

日英106個の既定ラベルを管理する。既定・カスタムともラベル自体をcriteriaのキーと値に使用し、既定だけの追加説明や移行処理は持たない。

### 10. SystemOneIntent

通常入力と編集・定型入力プレビューを独立管理する。入力停止後に`/v1/systemone`へ`state`・`model`・`questions.intent`を送り、Choice・Confidence・各選択肢のprobabilitiesを検証する。低Confidenceは最多確率の候補を添えた判定不能表示とする。選択画面はprobabilitiesが利用可能なら常に確率の降順に並べ、同率は設定順を保つ。HTTPエラー、15秒タイムアウト、不正応答は通信異常として区別し、いずれも送信前に確認する。クリック・タップで選択画面を閉じた際は入力欄へ、キーボード操作では判定ラベルへフォーカスを戻す。

- debounce、AbortController、revisionで古い応答を破棄する。IME変換中は判定しない。
- 意図設定の変更時だけ再判定し、テーマなど無関係な設定保存では手動選択・消去を保持する。
- 会話追跡はタグなしの本文から直近3ターンを構築する。履歴変更通知で会話を比較し、変化した場合は自動判定を無効化して再判定する。手動選択は保持する。
- 定型入力は既存の編集ダイアログを送信プレビューとして使用する。元の下書きとその手動選択は送信・キャンセルで上書きしない。

### 11. UIController

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
      → _applyInteractionMode()
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
  → TypingSimulator.start(onDisplayChunk, onAllDone, onWaitManual, ..., onPrepareChunk)
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
- 音声合成有効時は、チャンク確定時に `SpeechClient.synthesize()` を開始し、音声準備後にバブル表示と再生を同期
- 次チャンクへの進行は、通常の待機時間と `SpeechClient.play()` の再生完了Promiseの両方を待つ
- assistant メッセージは `SimpleMarkdown.render()` で HTML 変換して `innerHTML` に設定
- user メッセージは `textContent` で設定（XSS対策）
- タイムスタンプは最後のチャンクの後に表示

#### 履歴復元（`_renderAllMessages`）

ページ読み込み時、保存済み履歴を復元表示。
assistant メッセージは `_splitIntoChunks()` で分割し、実行時と同じマルチバブル表示を再現。
丸括弧内の分割抑止とかぎ括弧内の分割設定は、履歴復元・編集時の再表示にも適用する。応答待ちでない場合、分割設定の保存時にも履歴を再表示する。

#### クイックレスポンス

- 設定の `quickResponses` を改行区切りでパース
- 入力エリア上部にボタンとして表示
- クリックで即座にそのテキストを送信

#### 文字通話モード

- `Settings.appMode === "textCall"` かつ `_isCallActive === false` のときは待機画面。
  - `#chat-messages`, `#quick-responses`, `#mode-dropdowns`, `#input-area` を隠す。
  - `#call-standby` の「通話を開始」ボタンだけを中央表示する。
- 「通話を開始」クリック時:
  - `_isCallActive = true`
  - UIには「通話を開始しました」と表示
  - 履歴には通話開始用の内部ユーザーメッセージを追加し、既存の `_startStreaming()` 経路でAIへ送信
  - 通常のユーザーメッセージと同じく、有効なモードタグやタイムスタンプはAPI送信時に付加される
- 通話中はヘッダー中央の「通話を切断」ボタンを表示。
- 通話中は「通話を切断」ボタンと設定ボタン群の間に通話時間を表示し、1秒ごとに更新する。
- 「通話を切断」クリック時は `_isCallActive = false` に戻し、必要なら進行中ストリームを停止する。履歴は消去しない。
- 待機画面では `_lastCallDurationMs` を使って、中央上に「前回の通話時間」と前回の通話時間を大きく表示する。

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

- 背景画像全体をcontainで表示し、実際の背景レイヤーのcover表示範囲を切り出し枠で重ねる。枠のドラッグ・矢印キー操作を背景に即時反映し、「保存」で0〜1の位置を永続化する。サイズ変更時は枠を再計算し、キャンセル時は保存済み位置に戻す。
- 背景位置は数値のみを受け入れ、旧配置名などの非数値は破棄して既定値の0.5に戻す。
- テーマ変更時、即座にプレビュー
- キャンセル時は元のテーマに戻す
- スキャンライン効果も同様

---

## UI 構成 (index.html / index_en.html)

```
<body>
  <header id="toolbar">        ← タイトル + 通話切断 + 通話時間 + 設定/エクスポート/インポート/クリアボタン
  <main id="chat-area">         ← スクロール領域
    <div id="call-standby">     ← 文字通話モードの待機画面
      <div id="last-call-duration"> ← 前回の通話時間
    <div id="chat-messages">    ← バブル・インジケータの親
  <div id="quick-responses">    ← クイックレスポンスボタンエリア
  <footer id="input-area">      ← 縦2段の送信エリア
    <div id="microphone-controls"> ← 画面中央のマイクボタン + 認識状態
    <div id="input-row">        ← テキストエリア + 意図バッジ + 送信ボタン
  <div id="settings-overlay">   ← 設定ダイアログ（モーダル）
  <div id="intro-overlay">      ← イントロダイアログ（初回のみ）
  <div id="retry-bar">          ← エラー時リトライバー
  <div id="import-overlay">     ← インポートダイアログ
  <div id="confirm-overlay">    ← クリア確認ダイアログ
  <div id="bubble-action-overlay"> ← メッセージアクションダイアログ
  <div id="bubble-edit-overlay">   ← メッセージ編集・定型入力プレビュー
  <dialog id="intent-picker">      ← 意図の手動選択・消去
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

## 検証

- `node tests/openrouter-stt.cjs`：日英・通常版・配布版で認識エンジン切替・設定保持・キー分離・モデル手入力・言語自動判定、録音全体と最終チャンクのBase64送信、MIMEとformatの一致、短押し/PTT、送信待ちと連打、編集取消・HTTP/不正応答/通信エラー・タイムアウト・遅延許可・ページ離脱を確認。疑似マイクと標準MediaRecorderによる実WebM音声も検証する。APIはモックで、有料の実接続は含まない。

- `node tests/deepgram.cjs`：日英・通常版・配布版で設定保存・取消・キー保持・音声合成との独立、短押し・PTT・キーボード・タッチ、接続待ちの録音、遅延したマイク許可、途中結果の差し替え・重複排除、手動編集、最終結果待ちと送信、エラー・タイムアウト・後処理、モバイル／デスクトップ配置を確認。モックによる状態遷移に加え、疑似マイクとlocalhostのWebSocketサーバーでブラウザ標準MediaRecorder/WebSocketのWebM出力・最終音声とCloseStreamの送信順・トラック解放も確認する。課金されるDeepgram実接続や認識精度の確認は含まない。

- `node tests/context-limit.cjs`：上限到達後の送信確認、キャンセル時の履歴・入力保持、連打抑止、再表示条件、通常送信・定型入力・編集・再送信・通話開始、日英・通常版・配布版の確認。
- `node tests/intent-choices.cjs`：日英の選択肢数・重複・カスタム設定の保持。
- `node tests/intent.cjs`：debounce、Confidence、送信確認、手動選択・消去、送信内容、モバイル配置。
- `node tests/intent-lifecycle.cjs`：下書き保持、無関係な設定保存、履歴変更時の再判定、タグ付き割り込み連結、タグ境界の保存・復元。
- `node tests/communication-errors.cjs`：チャット・意図判定（通常入力・編集・送信確認）・VOICEVOXのHTTPステータス／例外メッセージ表示、再試行時の更新、Unicode文字数。
- `node tests/irodori.cjs`：日英・通常版・配布版でIrodoriのAPI契約、認証、話者手入力、実WAVのデコードによる無音判定・再試行上限、設定保存、排他切り替え、注釈除去、表示同期、合成失敗時の続行、割り込み、VOICEVOX互換性。
- `node tests/openrouter-tts.cjs`：日英・通常版・配布版でOpenRouterのPCM/MP3選択・保存・キャンセル、WAV化したPCMの実デコード・音声メタデータ・サンプル保持、URL・キー分離、Base URL変更・保存・末尾スラッシュ、モデル手入力・既定値、3エンジンの排他切り替え、注釈除去、HTTP・通信・不正応答、表示同期、失敗時の続行、割り込みを確認。APIと再生タイミングはモックで、課金される実接続・音質確認は含まない。
- `node tests/background.cjs`、`node tests/floating-icons.cjs`：既存機能の回帰確認。

ブラウザテストはPlaywrightとEdgeを使用し、日英の通常版・単一HTML配布版を確認する。APIはモックのため、Jev実接続での分類精度・Confidenceの評価や、Irodori実サーバーの推論・音質評価は含まない。
