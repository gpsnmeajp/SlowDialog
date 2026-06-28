# SlowDialog
[Try the demo here](https://gpsnmeajp.github.io/SlowDialog/index_en.html)  
[日本語 README](README.md)

<img width="610" height="54" alt="image" src="https://github.com/user-attachments/assets/b93e43dd-6380-4b42-a2a6-73d31e0a4ae7" />

A chat application designed to give humans back control of the conversation with AI.

AI fires off a wall of text all at once, you respond, and then it fires off another wall. Before you know it, your thoughts are racing and you find yourself thinking, "Wait, what was I trying to do again?"
Sound familiar?

Instead of displaying AI responses all at once, this software delivers them slowly, little by little — as if you were chatting with a real person.
It intentionally adds waiting time, or lets you advance with a button press.

If something feels off, you can interrupt the AI without waiting for it to finish speaking.
This creates a reading experience similar to game dialogue, giving you time to think and making conversations feel more natural.

<img width="300" src="https://github.com/user-attachments/assets/f746882f-b05f-48d2-bcf0-092c7221625b" />　<img width="300" src="https://github.com/user-attachments/assets/161de563-0cc9-49f1-9260-191eef71854b" />

Feel free to chime in whenever you like.

<img width="300" src="https://github.com/user-attachments/assets/aa103612-261d-40ec-99ae-412a3153b6d0" />　<img width="300" src="https://github.com/user-attachments/assets/6a88728e-6468-410e-abc3-fe19a72137b3" />

<img width="300" src="https://github.com/user-attachments/assets/dfde7498-61e8-4387-a477-493cc6cfad6b" />　<img width="300" src="https://github.com/user-attachments/assets/409fdcb5-75f8-4f34-9003-f77d415fa128" />

Color theme

<img width="300" src="https://github.com/user-attachments/assets/75485b00-0492-4c5c-bd8e-913ef3eb2b5f" />　<img width="300" src="https://github.com/user-attachments/assets/5d8eb689-e599-4797-a8be-e9300a0d7cc8" />

<img width="300" src="https://github.com/user-attachments/assets/1ddf2a29-6c63-4e37-8cf7-d8dfef98d985" />　<img width="300" src="https://github.com/user-attachments/assets/b0817eed-9493-412e-bb49-7c42547416a2" />


This software was vibe-coded using Google Antigravity and GitHub Copilot.

## Features

- **Delayed Display** — AI responses are split at punctuation marks and line breaks, with pauses proportional to the character count. A typing indicator is shown during the waiting time.
- **Interruption** — You can send a message even while the AI is still "speaking." The AI output is interrupted, the displayed content is finalized, and the conversation continues from there.
- **Manual Advance Mode** — Turn off auto-advance and use the "Continue" button to read at your own pace.
- **Pause/Resume** — Use the pause button during auto-advance to control reading pace.
- **Quick Responses** — Register frequently used replies as buttons and send them with one click.
- **Mode Tags** — Select tags from dropdowns to append them to your prompt on send. Combined with your system prompt, this lets you switch AI behavior on the fly.
- **Text Call Mode** — Start an AI text call from a standby screen instead of showing the normal chat UI immediately.
- **Message Edit & Delete** — Tap messages to resend, edit, or delete them.
- **Timestamp Sending** — Send message timestamps to the AI for time-aware responses.
- **VOICEVOX Speech Synthesis** — Connect to VOICEVOX Engine and synthesize AI responses in the same units as chat bubbles.
- **Multi-language Support** — Provides Japanese and English interfaces.
- **Rich Color Themes** — Choose from 14 retro-style themes including GB Classic, Red, Amber, Green, Blue, Mono, DOS Console, and MSX Console. Each theme has an inverted version.
- **Font Selection** — Choose from k8x12 series, Misaki Gothic, or Noto Sans JP fonts.
- **Scanline Effect** — Enable retro CRT-style scanline effects with adjustable intensity.
- **Sound Effects** — Retro sound effects play when sending and receiving messages.
- **Game Boy–style Design** — A nostalgic, calm aesthetic powered by pixel fonts and a 4-color palette.
- **No Frameworks** — A simple single-page application built with HTML, CSS, and JavaScript only.

## Requirements

- A modern browser (latest version of Chrome, Firefox, Safari, or Edge)
- An endpoint and API key for an OpenAI-compatible ChatCompletion API (with SSE streaming support)
- VOICEVOX Engine running locally or on the same network when using speech synthesis

## Usage

### Getting Started

Simply open `index_en.html` in your browser. No build step or server setup is required.

Please use a service that provides an OpenAI-compatible API.

OpenRouter is recommended, but local LLMs also work.  
Using OpenRouter's `perplexity/sonar-pro` and similar models, you can even search for information on the web.

**Note:** Direct connection to Ollama Cloud is not supported due to authentication errors during preflight. You can use it by installing Ollama on your PC and logging into Cloud.

### Initial Setup

On first launch, an intro dialog will appear, followed by a settings dialog. Please fill in the following:

| Field | Description | Default |
|-------|-------------|---------|
| Mode | Switch between Chat and Text Call | Chat |
| Base URL | API base URL | `https://openrouter.ai/api/v1` |
| API Key | API key | — |
| Model Name | Model identifier to use | `google/gemini-3-flash-preview` |
| System Prompt | Instructions for the AI | `You are a helpful assistant.` |
| Font | Display font | Noto Sans JP |
| Theme | Color theme | GB Classic |
| Auto Advance | Whether to advance automatically | On |
| Pause Button (Auto Advance) | Show pause button during auto-advance | On |
| Sound Effects | Whether to enable sound effects | On |
| VOICEVOX Speech Synthesis | Read AI responses aloud with VOICEVOX | Off |
| VOICEVOX URL | VOICEVOX Engine URL | `http://localhost:50021` |
| VOICEVOX Speaker | Speaker ID used for synthesis | 3 |
| VOICEVOX Speech Parameters | Speed, pitch, intonation, volume, pre/post silence | Defaults per field |
| Borders | Show message borders | On |
| Send Time to AI | Add timestamp to user messages | Off |
| Scanline Effect | Retro-style scanline effect | Off |
| Scanline Strength | Scanline intensity (1-50%) | 2% |
| Delay per Character | Delay display speed (ms) | 150 |
| Minimum Delay | Minimum delay between chunks (seconds) | 2 |
| Context Size | Number of history messages sent to API | 1000 |
| Quick Responses | One-click replies (newline-separated) | Hold on<br>Too long<br>In a word?<br>Why?<br>Not right |
| Mode Tags | Show mode tag dropdowns | Off |
| Mode 1–4 | Mode choices (newline-separated) | (see defaults) |

#### Font Options

- **k8x12S** — 8-dot non-kanji pixel font
- **k8x12** — Standard pixel font
- **k8x12L** — Tall kana variant pixel font
- **Misaki Gothic** — 8×8 dot Japanese font
- **Noto Sans JP** — Google's readable sans-serif font

#### Color Theme List

- **GB Classic / GB Classic (Inverted)** — Game Boy-style 4-color green palette
- **Red / Red (Inverted)** — Red monochrome palette
- **Amber / Amber (Inverted)** — Amber monochrome palette (retro PC style)
- **Green / Green (Inverted)** — Green monochrome palette (terminal style)
- **Blue / Blue (Inverted)** — Blue monochrome palette
- **Mono / Mono (Inverted)** — Black and white palette
- **DOS Console** — MS-DOS style color palette
- **MSX Console** — MSX style color palette

Settings are saved in the browser's localStorage and automatically loaded on subsequent visits.

<img width="300" src="https://github.com/user-attachments/assets/9e87c32c-bd49-4e83-81c4-8f3a6a7886d6" />

### How Interruption Works

You can type /Importing History

You can download the conversation history in JSON format from the export button in the toolbar. The exported JSON includes quick response settings, system prompt, and conversation history.

From the import button, you can restore history by uploading a previously exported JSON file or pasting JSON text is not simply hidden — the history is modified.)
- If nothing has been displayed yet, the previous user message and the new message are concatenated.

### Exporting / Importing History

You can download the conversation history in JSON format from the export button in the toolbar. The exported JSON includes quick response settings, mode tag settings, system prompt, and conversation history.

From the import button, you can restore history by uploading a previously exported JSON file or pasting JSON text.

## VOICEVOX Speech Synthesis

Enable **"VOICEVOX Speech Synthesis"** in the settings dialog to read AI responses aloud through VOICEVOX. The default URL is `http://localhost:50021`.

- **Test Connection** — Checks whether SlowDialog can reach VOICEVOX Engine through `/version`.
- **Load Speakers** — Loads speakers and styles from `/speakers` and updates the speaker selector.
- **Speech Parameters** — Configure speed, pitch, intonation, volume, pre-phoneme length, and post-phoneme length.

Synthesis uses the same chunk boundaries as chat bubbles. SlowDialog starts synthesis as soon as each chunk is known, then displays the bubble and starts playback together when audio is ready. The next bubble waits for whichever is longer: the normal display delay or the speech playback duration.

## Text Call Mode

Select **"Text Call"** from **"Mode"** at the top of the settings dialog. In standby, the chat history and input area are hidden, and only the **"Start Call"** button appears in the center.

When you press "Start Call", the normal chat screen opens and displays **"Call started"**. At the same time, SlowDialog automatically sends an internal call-start message to the AI, prompting it to begin the conversation.

During a call, the header shows an **"End Call"** button in the center, with the call duration displayed to its right. Pressing it returns to standby without clearing any conversation history. The standby screen shows **"Previous Call Duration"** and the previous call duration prominently above the start button.

## Using Mode Tags

Mode tags automatically append a tag to the end of your user prompt on each send.  
The tag is added only at send time and does not appear in the chat display or history.

### Setup

1. Enable **"Mode Tags"** in the settings dialog.
2. Enter newline-separated choices for **Mode 1–Mode 4** (modes with no entries will not show a dropdown).
3. After saving, dropdowns appear below the quick response buttons.

### How to Use

When you send a message, the currently selected value from each dropdown is appended to the prompt, separated by a space.

**Example:** With Mode 1 set to `#short only`, sending "What's the plan for today?" delivers  
`What's the plan for today? #short only`  
to the AI.

### Combining with the System Prompt

Define what each tag means in your system prompt, and you can instantly switch the AI's response style just by changing the dropdown.

**Example system prompt:**
```
You are a helpful assistant.
When the user's message contains the following tags, respond in the corresponding style.
#short only  → Answer concisely in 3 lines or fewer.
#long allowed → Answer in detail.
#task        → Organize things as a bullet-point to-do list.
#chat        → Have a friendly, casual conversation.
#energetic   → Speak in a bright, upbeat tone.
#tired       → Speak in a calm, gentle tone.
```

## File Structure

```
slowdialog/
├── index.html          # Entry point (Japanese)
├── index_en.html       # Entry point (English)
├── style.css           # Style definitions
├── app.js              # Application logic
├── README.md           # Documentation (Japanese)
├── README_EN.md        # Documentation (English)
├── fonts/
│   ├── littlelimit/
│   │   ├── k8x12.ttf       # k8x12 (pixel font)
│   │   ├── k8x12L.ttf      # k8x12L (tall kana variant)
│   │   ├── k8x12S.ttf      # k8x12S (8-dot non-kanji)
│   │   ├── misaki_gothic.ttf  # Misaki Gothic
│   │   └── LICENSE
│   └── notosansjp/
│       ├── NotoSansJP-VariableFont_wght.ttf
│       └── OFL.txt
└── sound/
    ├── user.wav            # User send sound
    ├── assistant.wav       # AI response sound
    └── assistant_end.wav   # AI response complete sounda variant)
    ├── k8x12S.ttf      # k8x12S (8-dot non-kanji)
    └── misaki_gothic.ttf  # Misaki Gothic
```

## About the Fonts

The following fonts are bundled with this application:

- **k8x12 / k8x12L / k8x12S / Misaki Gothic** — 8×8 dot Japanese fonts by Num Kadoma. Available at [Little Limit](https://littlelimit.net/font.htm).

Please refer to each font's distribution page for licensing details.

## License

The source code, excluding font files, is licensed under the MIT License.

