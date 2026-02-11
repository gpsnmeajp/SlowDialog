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

This software was vibe-coded using Google Antigravity and GitHub Copilot.

## Features

- **Delayed Display** — AI responses are split at punctuation marks and line breaks, with pauses proportional to the character count. A typing indicator is shown during the waiting time.
- **Interruption** — You can send a message even while the AI is still "speaking." The AI output is interrupted, the displayed content is finalized, and the conversation continues from there.
- **Manual Advance Mode** — Turn off auto-advance and use the "Continue" button to read at your own pace.
- **Quick Responses** — Register frequently used replies as buttons and send them with one click.
- **Message Edit & Delete** — Tap messages to resend, edit, or delete them.
- **Multi-language Support** — Provides Japanese and English interfaces.
- **Customizable Themes** — Choose from multiple retro-style color themes and scanline effects.
- **Sound Effects** — Retro sound effects play when sending and receiving messages.
- **Game Boy–style Design** — A nostalgic, calm aesthetic powered by pixel fonts and a 4-color palette.
- **No Frameworks** — A simple single-page application built with HTML, CSS, and JavaScript only.

## Requirements

- A modern browser (latest version of Chrome, Firefox, Safari, or Edge)
- An endpoint and API key for an OpenAI-compatible ChatCompletion API (with SSE streaming support)

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
| Base URL | API base URL | `https://openrouter.ai/api/v1` |
| API Key | API key | — |
| Model Name | Model identifier to use | `google/gemini-3-flash-preview` |
| System Prompt | Instructions for the AI | `You are a helpful assistant.` |
| Font | Display font | k8x12S |
| Theme | Color theme | GB Classic |
| Auto Advance | Whether to advance automatically | On |
| Sound Effects | Whether to enable sound effects | On |
| Scanline Effect | Retro-style scanline effect | Off |
| Delay per Character | Delay display speed (ms) | 150 |
| Minimum Delay | Minimum delay between chunks (seconds) | 2 |
| Context Size | Number of history messages sent to API | 20 |
| Quick Responses | One-click replies (newline-separated) | I see… |

Settings are saved in the browser's localStorage and automatically loaded on subsequent visits.

<img width="300" src="https://github.com/user-attachments/assets/9e87c32c-bd49-4e83-81c4-8f3a6a7886d6" />

### How Interruption Works

You can type /Importing History

You can download the conversation history in JSON format from the export button in the toolbar. The exported JSON includes quick response settings, system prompt, and conversation history.

From the import button, you can restore history by uploading a previously exported JSON file or pasting JSON text is not simply hidden — the history is modified.)
- If nothing has been displayed yet, the previous user message and the new message are concatenated.

### Exporting History

You can download the conversation history in JSON format from the export button in the toolbar.

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

