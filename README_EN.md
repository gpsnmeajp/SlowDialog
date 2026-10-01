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
- **Quick Responses** — Register common replies for one-click sending. With Intent enabled, review them in a separate send preview first.
- **Intent Classification** — Review and adjust Jev's prediction before sending an intent tag to the AI.
- **Mode Tags** — Select tags from dropdowns to append them to your prompt on send. Combined with your system prompt, this lets you switch AI behavior on the fly.
- **Text Call Mode** — Start an AI text call from a standby screen instead of showing the normal chat UI immediately.
- **Message Edit & Delete** — Tap messages to resend, edit, or delete them.
- **Timestamp Sending** — Send message timestamps to the AI for time-aware responses.
- **OpenRouter TTS Speech Synthesis** — Read AI replies with OpenRouter or a compatible API, with an editable Base URL, manual model/voice IDs, PCM/MP3 format selection, speed settings, and speech tests.
- **Irodori-TTS Speech Synthesis** — Connect to [Aratako/Irodori-TTS-Server](https://github.com/Aratako/Irodori-TTS-Server) for synchronized speech with reference voices and voice descriptions.
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
- For Deepgram recognition: a Deepgram API key, available quota, and microphone permission over HTTPS or localhost (local HTML works where the browser permits microphone access)
- An OpenRouter API key and available quota or credits for your chosen model when using OpenRouter TTS
- Irodori-TTS-Server running locally or on the same network when using Irodori speech synthesis
- VOICEVOX Engine running locally or on the same network when using speech synthesis

## Usage

### Getting Started

Simply open `index_en.html` in your browser. No build step or server setup is required.

When downloading the app onto a smartphone and opening it locally, use the single-file package `dist/index_en.html` instead of the repository-root `index_en.html`. The HTML files in `dist/` embed the fonts and sound effects, so each one can run as a single file.

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
| Background image | Select or remove an image in Display. Saved within 4096×4096 pixels and scaled to cover the screen without margins while preserving its aspect ratio. The preview box marks the visible crop | None |
| Chat area | Space to leave clear from the top of the screen (0–95%). At 50%, chat bubbles appear in the lower half. At least 5% of the original chat area remains above the input controls | 0% |
| Background crop position | Drag the screen-proportioned box over the full image preview. Arrow keys also move it (Shift for larger steps). Position is saved as normalized values from 0 to 1 | Center (0.5, 0.5) |
| Background transparency | Slider from 0% (opaque) to 100% (transparent) | 0% |
| Auto Advance | Whether to advance automatically | On |
| Split inside Japanese quotation marks | Allow display and speech splitting inside `「…」` / `『…』` in the Conversation tab | Off |
| Pause Button (Auto Advance) | Show pause button during auto-advance | On |
| Sound Effects | Whether to enable sound effects | On |
| VOICEVOX Speech Synthesis | Read AI responses aloud with VOICEVOX | Off |
| Deepgram Speech Recognition | Enable microphone input in the Recognition tab | Off |
| Deepgram API Key | Separate speech recognition key | Blank |
| Recognition Model | Enter a streaming model ID or choose a suggestion | `nova-3` |
| Recognition Language | Japanese, English, or multilingual (including Japanese and English) | Japanese on the Japanese page; English on the English page |
| OpenRouter STT Speech Recognition | Switch from Deepgram to transcription after recording | Off |
| OpenRouter STT Base URL / API Key | Separate recognition endpoint and key | `https://openrouter.ai/api/v1` / Blank |
| OpenRouter STT Model / Language | Editable model ID; Japanese, English, or auto-detect | `openai/whisper-1` / Page language |
| VOICEVOX URL | VOICEVOX Engine URL | `http://localhost:50021` |
| VOICEVOX Speaker | Speaker ID used for synthesis | 3 |
| VOICEVOX Speech Parameters | Speed, pitch, intonation, volume, pre/post silence | Defaults per field |
| Skip ruby and notes in speech | Exclude ruby text and notes inside `()` / `（）` from VOICEVOX synthesis | On |
| OpenRouter TTS Speech Synthesis | Read AI responses aloud with OpenRouter (exclusive with other speech engines) | Off |
| OpenRouter TTS Base URL | Speech API base URL | `https://openrouter.ai/api/v1` |
| OpenRouter API Key | Speech API key, separate from chat settings | Blank |
| OpenRouter Speech Model / Voice ID | Enter IDs manually | `google/gemini-3.8-flash-tts` / `Zephyr` |
| OpenRouter Response Format | PCM or MP3; PCM plays as 24 kHz, 16-bit, mono audio | `pcm` |
| OpenRouter Speed / Skip ruby and notes | Speed applies only to supported models | 1 / On |
| Irodori-TTS Speech Synthesis | Read AI responses aloud with Irodori-TTS (exclusive with other speech engines) | Off |
| Irodori-TTS URL | Server URL; trailing `/v1` is optional | `http://localhost:8088` |
| Irodori-TTS API Key / Model | Optional server key and model ID | Blank / `irodori-tts` |
| Irodori-TTS Voice | Server voice ID | `none` (no reference audio) |
| Irodori-TTS Speech Parameters | Speed, voice/style description, sampling steps, seed | Speed 1; others blank |
| Borders | Show message borders | On |
| Send Time to AI | Add timestamp to user messages | Off |
| Scanline Effect | Retro-style scanline effect | Off |
| Scanline Strength | Scanline intensity (1-50%) | 2% |
| Delay per Character | Delay display speed (ms) | 150 |
| Minimum Delay | Minimum delay between chunks (seconds) | 2 |
| Context Size | Number of history messages sent to API | 1000 |
| Quick Responses | Preset replies (newline-separated) | Hold on<br>Too long<br>In a word?<br>Why?<br>Not right |
| Intent | Enable in the Intent tab | Off |
| Jev Base URL | System One API endpoint | `https://openrouter.ai/api` |
| Jev API key | Key for intent classification | — |
| Jev model | Classification model | `~typesafe/jev-latest` |
| Classification delay | Seconds after typing stops | 0.5 |
| Minimum confidence | Lower values require send confirmation | 0.65 |
| Intent choices | 2–255 options, one per line | 106 choices |
| Additional question guidance | Custom classification guidance | Empty |
| Conversation tracking | Include the last three turns | Off |
| Mode Tags | Show mode tag dropdowns | Off |
| Mode 1–4 | Mode choices (newline-separated) | (see defaults) |

#### Note when using an `http://` Base URL

If you open SlowDialog over `https://`, such as the demo page, and set a Base URL that starts with `http://`, the browser will block the request as "mixed content" for security reasons.

In this case, pressing the save button shows a warning. The settings are saved, but SlowDialog still cannot connect to that API URL. Use one of these approaches:

- Save the SlowDialog HTML file on your PC and open it as a local file
- Or run both SlowDialog and the API through a separate HTTP server

For beginners: most browsers do not allow an `https://` page to connect directly to an `http://` API. If you use a local LLM or local API, make sure the way you open the page matches the way the API is served.

#### Floating Icons

Use the toolbar's image-add button to place borderless images on the screen. Multiple images are supported and saved in the browser, resized to at most 4096×4096 pixels.

- Images start at the upper right below the toolbar, fitting within one quarter of the placement area's width and height while preserving their aspect ratio.
- Drag or swipe to move; pinch with two fingers to resize.
- Right-click or long-press to open size controls (5–100%), lock/unlock position, or delete. Resizing remains available while position is locked.
- Position and size are automatically saved as normalized relative values and adapt to screen resizing and page reloads.
- With keyboard focus on an icon, use arrow keys to move and Enter or Shift+F10 to open its menu.

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

You can type and send a new message even while the AI response is still being displayed. In that case, SlowDialog handles it as follows:

- The AI output is interrupted, and the text already shown is finalized into the history. It is not simply hidden; the history is updated.
- If nothing has been displayed yet, the previous user message and the new message are concatenated.

### Exporting / Importing History

You can download the conversation history in JSON format from the export button in the toolbar. The exported JSON includes quick response settings, mode tag settings, system prompt, and conversation history.

From the import button, you can restore history by uploading a previously exported JSON file or pasting JSON text.

## Deepgram Speech Recognition

In **Recognition** settings, check **Deepgram speech recognition**, enter an API key, choose a model and language, and save. The model field accepts manual IDs, suggests `nova-3` and `nova-2`, and defaults to `nova-3` when blank. Recognition is independent of speech synthesis, and disabling it preserves the key, model, and language.

When enabled, the taller input area includes a microphone button centered above the text box. It shares the Send button's theme and 40 × 40px size. When both Deepgram and OpenRouter STT are disabled, the microphone and status are hidden and the input area returns to its normal height.

- **Tap** to start or stop continuous recognition.
- **Hold for at least 350ms** for push-to-talk. Capture starts on press and stops on release, including when released outside the button.
- **Keyboard:** focus the microphone and use Space or Enter for the same tap/hold controls.
- Interim results update the input box and are replaced by final results. Speech appends to an existing draft. Manual editing stops recognition and takes ownership of the text.
- Stopping recognition does not send a chat message. Send or Enter in the text box immediately stops capture, then waits for the last transcription before sending.
- Opening settings, ending a text call, or hiding the page stops capture. Permission and connection errors appear below the microphone.

The browser streams microphone audio directly to Deepgram using the selected model (Nova-3 by default). The API key is stored in the browser with other settings, and recognition incurs Deepgram usage charges. Microphone permission is required. Open over HTTPS or localhost; local HTML works where the browser permits microphone access from files. Choose a model and language supported by the [Deepgram v1 streaming API](https://developers.deepgram.com/reference/speech-to-text/listen-streaming).

## OpenRouter STT Speech Recognition

In **Recognition** settings, check **OpenRouter STT speech recognition**, set an API key, model and language, then save. It switches exclusively with Deepgram and preserves both configurations. Speech synthesis can remain enabled independently. The recognition key is separate from chat and synthesis settings.

- Base URL defaults to `https://openrouter.ai/api/v1` and can be changed for a compatible API.
- The model defaults to `openai/whisper-1` and accepts manual model IDs. Languages are Japanese, English, or auto-detect.
- Use the shared microphone's tap toggle or hold-to-talk controls. Transcription begins when recording stops and appends the result to the draft.
- Send immediately stops capture, waits for transcription, then sends the chat. Editing or opening settings cancels transcription and any pending send, preventing late results from overwriting the draft.

Following the [OpenRouter STT specification](https://openrouter.ai/docs/guides/overview/multimodal/stt), the complete clip is encoded as Base64 and sent to `/audio/transcriptions`. Text is not transcribed incrementally during recording. Recordings are limited to 20 MiB, with a 65-second processing timeout after stop. Failures preserve the draft and display an error.

## VOICEVOX Speech Synthesis

Enable **"VOICEVOX Speech Synthesis"** in the settings dialog to read AI responses aloud through VOICEVOX. The default URL is `http://localhost:50021`.

- Set **CORS Policy Mode** to **all** in VOICEVOX Engine settings so the browser can connect.
- Use **"Open Engine Settings"** to open `{VOICEVOX URL}/setting`.
- **Test Connection** — Checks whether SlowDialog can reach VOICEVOX Engine through `/version`.
- **Load Speakers** — Loads speakers and styles from `/speakers` and updates the speaker selector.
- **Speech Parameters** — Configure speed, pitch, intonation, volume, pre-phoneme length, and post-phoneme length.
- **Skip ruby and notes in speech** — Enabled by default. Ruby markup and notes inside `()` / `（）` stay visible on screen but are removed from the text sent to VOICEVOX.
- **Test Speech** — Synthesizes the test text with the current form settings and plays it immediately.

Synthesis uses the same chunk boundaries as chat bubbles. SlowDialog starts synthesis as soon as each chunk is known, then displays the bubble and starts playback together when audio is ready. The next bubble waits for whichever is longer: the normal display delay or the speech playback duration.

Display and speech chunks never split at periods or line breaks inside full-width or half-width parentheses. Japanese quotation marks (`「…」` and `『…』`) also prevent splitting by default. Enable “Split inside Japanese quotation marks” in the Conversation tab to allow splitting within those quotes; parentheses still stay together. Nested brackets are supported, and restored history follows the same rules.

## Irodori-TTS Speech Synthesis

Enable **Irodori-TTS Speech Synthesis** in the **Speech** settings tab. Enabling a speech engine disables the others while keeping each engine's settings. Existing VOICEVOX settings continue to work.

1. Start [Irodori-TTS-Server](https://github.com/Aratako/Irodori-TTS-Server). The default URL is `http://localhost:8088`; a trailing `/v1` is also accepted.
2. Configure CORS in the server `.env` and restart the server. Use `IRODORI_CORS_ORIGINS=["null"]` for local HTML files. For a page served over HTTP, specify its origin, for example `IRODORI_CORS_ORIGINS=["http://localhost:8000"]`.
3. Enter an API key only if the server has `IRODORI_API_KEY` set. The model defaults to `irodori-tts`; change it to match any custom `IRODORI_MODEL_NAME`.
4. Use **Test Connection** to check connectivity and authentication, then enter a voice ID directly in **Irodori-TTS Voice**. **Load Voices** provides suggestions when supported; manual IDs also work through relay servers without voice listing. Add reference audio to the server's `voices` folder. `none` generates without reference audio; select a reference voice for consistency across bubbles. Leave the voice field blank to use `IRODORI_DEFAULT_VOICE` on the server.
5. Use **Test Speech** with the current form settings, then save. You can set speed (0.25–4), voice/style description, sampling steps, and seed. Descriptions require a compatible model. Blank steps use the server/model default; a blank seed uses random generation.

Like VOICEVOX, synthesis follows bubble boundaries and playback starts with each bubble. Ruby and parenthetical notes are skipped by default without changing display text or history. Silent audio is regenerated up to three times (four attempts including the first). Replies still appear without audio if every attempt is silent or synthesis fails. **Open API Docs** opens the server's `/docs` page.

## OpenRouter TTS Speech Synthesis

Enable **OpenRouter TTS Speech Synthesis** in the **Speech** settings tab. This disables VOICEVOX and Irodori-TTS while preserving their settings.

1. Enter the **Base URL** and **OpenRouter API Key** in the speech settings. The Base URL defaults to `https://openrouter.ai/api/v1` and can point to a compatible API. Requests append `/audio/speech`. Chat URL and key settings are not reused automatically.
2. Enter the **Speech Model** ID manually. The default is `google/gemini-3.8-flash-tts`. Model discovery is not used.
3. Enter a supported **Voice ID** (default: `Zephyr`). Voices and speed support vary by model; check the model's page when switching.
4. Select **PCM** or **MP3** in **Response Format**. Use the default PCM for Gemini TTS. Existing settings without a saved format also default to PCM.
5. Use **Test Speech** with the current form settings, then save. Speech tests incur the model's usual charges.

Synthesis uses the selected format and follows bubble boundaries, with playback starting alongside each bubble. PCM is wrapped in a WAV header for playback as 24 kHz, 16-bit, little-endian mono audio; MP3 is played directly. Ruby and parenthetical notes are skipped by default. Failed synthesis still allows text to appear, and results discarded after an interruption are not played. The browser connects directly to the configured Base URL. See the [OpenRouter TTS documentation](https://openrouter.ai/docs/guides/overview/multimodal/tts) for the API specification.

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

## System One Intent

Enable **Intent** in settings to classify drafts with Jev Choice after 0.5 seconds without typing (off by default). Select the badge to the left of Send to change or remove the tag. Wait for the result before sending. Quick responses open a separate send preview and preserve the original draft on send or cancel; editing a previous message also gets a fresh classification.

- Base URL: `https://openrouter.ai/api`. Any compatible System One API is supported. `/v1/systemone` is appended; a base ending in `/v1` or the full endpoint is also accepted. Configure the Jev API key separately. Default model: `~typesafe/jev-latest`.
- Delay: 0.5 seconds by default. Minimum confidence: 0.65. Below the threshold, the badge shows **Unclear intent(top candidate?)**. Whenever probabilities are available, the intent picker sorts choices by descending probability, preserving configured order for ties. Connection failures, timeouts, and invalid responses show **Connection error(429)**, with the HTTP status code or the first eight characters of the exception message in parentheses. Send confirmations, chat connection failures, and VOICEVOX test results use the same format for error details. Both unclear intent and connection error require confirmation before sending; confirmed messages carry no tag.
- Choices: 2–255 options, one per line. Defaults distinguish emotional conversation (listening, comfort, encouragement, reassurance), supportive discussion (processing feelings, self-exploration, coping, relationships), character chat (affection, closeness, romance, fictional conflict, out-of-character discussion), tabletop-style games and adventures (investigation, NPC dialogue, combat, rolls, branches, hints), and work (research, analysis, creation, review, planning, authorization). Additional question guidance is configurable.
- Conversation tracking: off sends only the draft; on includes the last three turns (each user utterance and subsequent assistant replies). Intent tags, outgoing mode tags, and timestamps are excluded. Classification instructions use English, except for choices, input data, and custom guidance.

The LLM receives a suffix such as `I'm tired today [Seeking empathy]`. Intent appears beside the timestamp instead of inside the message body. Tags survive reload and JSON export/import. Interruptions before any assistant output still merge user messages, retaining each utterance's tag. Editing the draft or Intent settings triggers classification again; tracking also refreshes automatic results when history changes. Manual choices and removal remain until the draft or Intent settings change. Obsolete responses are discarded.

When enabled, drafts are sent to the configured Jev endpoint before sending to the chat model. Tracking also sends conversation history. The endpoint must support browser requests (CORS).

Specifications: [TypeSafe Choice](https://docs.typesafe.ai/primitives/choice), [OpenRouter System One API](https://openrouter.ai/docs/guides/community/typesafe-sdk).

## File Structure

```
slowdialog/
├── index.html          # Entry point (Japanese)
├── index_en.html       # Entry point (English)
├── style.css           # Style definitions
├── app.js              # Application logic
├── package_single_html.py  # Single-file HTML package builder
├── README.md           # Documentation (Japanese)
├── README_EN.md        # Documentation (English)
├── dist/               # Single-file HTML package output
│   ├── index.html      # Japanese version (generated)
│   └── index_en.html   # English version (generated)
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
    ├── assistant_end.wav   # AI response complete sound
    ├── begin.wav           # Call start sound
    └── end.wav             # Call end sound
```

## About the Fonts

The following fonts are bundled with this application:

- **k8x12 / k8x12L / k8x12S / Misaki Gothic** — 8×8 dot Japanese fonts by Num Kadoma. Available at [Little Limit](https://littlelimit.net/font.htm).

Please refer to each font's distribution page for licensing details.

### Building Single-File HTML Packages

For distribution, you can build HTML files that bundle the HTML, CSS, JavaScript, fonts, and sound effects into one file.

```sh
python package_single_html.py
```

This writes the following files to `dist/`.

- `dist/index.html` — Japanese version
- `dist/index_en.html` — English version

The `dist/` directory is included in the repository as the distribution package. Use these HTML files when copying or downloading SlowDialog onto a smartphone.

The generated files embed fonts and sound effects as data URLs, so each HTML file can run on its own. External API, VOICEVOX Engine, and Irodori-TTS-Server requests still connect from the browser to the configured URLs, just like the normal version.

Use `--dist` to change the output directory.

```sh
python package_single_html.py --dist release
```

## License

The source code, excluding font files, is licensed under the MIT License.

