# P4 华文 Practice Papers

Primary 4 Chinese practice papers (2025 End-of-Year exams) with automatic marking, Gemini marking of **handwritten** answers, a chat helper (华文小帮手) and PDF reports. Chinese companion to [p4-math](https://github.com/imBuenoing/p4-math): no build step, everything runs in the browser.

## Gemini API key

The repo secret **`GEMINI_API_KEY`** is injected at **deploy time** into the live Pages site. It is **not** committed to git (GitHub push protection blocks that).

1. Add/update [Settings → Secrets → Actions → `GEMINI_API_KEY`](https://github.com/imBuenoing/p4-chinese-paper2/settings/secrets/actions)
2. Switch Pages to Actions deploy (one-time): [Settings → Pages](https://github.com/imBuenoing/p4-chinese-paper2/settings/pages) → **Build and deployment** → Source = **GitHub Actions**
3. Re-run **Actions → Deploy site with Gemini key → Run workflow** (or push to `main`)

Check: open `https://imbuenoing.github.io/p4-chinese-paper2/js/config.js` — it should show a real key string, not `__GEMINI_API_KEY_PLACEHOLDER__`.

For local use, copy `js/config.example.js` to `js/config.js` and add a key, or leave it empty (options questions still mark; a parent marks writing by hand).

## Papers

| School | Paper | Marks |
| --- | --- | --- |
| 南侨小学 Nan Chiau | 试卷二 语文理解与运用 | 45 |
| 恒力小学 Henry Park | 试卷二 语文理解与运用 · 试卷一 看图作文 | 45 · 15 |
| 公教中学（附小）Catholic High | 试卷二 语文理解与运用 · 试卷一 看图作文 | 45 · 15 |
| 英华小学 ACS (Primary) | 试卷二 语文理解与运用 | 45 |

The listening paper (听力) is not included because it needs the recording.

## How answering works

- **Questions with options on the paper** (辨字, 词语选择, 短文填空, 词语搭配, 阅读理解一 MCQs) are answered on screen and marked instantly against the answer key.
- **Questions with no options** (便条/短信, 阅读理解二, 作文) have **no text box**. The child writes the answers on paper, starting each with its question number, then adds photos at the bottom of the paper. On submit, the photos go to Gemini, which reads the handwriting, marks each answer against the answer key and marking scheme, and shows what it read, the feedback and a full-marks answer.
- A parent PIN is needed to submit, to change photos and re-mark, and to change any handwritten mark (e.g. if Gemini misread a word). It is the same PIN as the P4 Maths app.
- After marking: strengths and weak areas by topic (based on the MOE Primary Chinese Language syllabus 2024), a downloadable marked paper + report PDF (with the photos at the end), the 华文小帮手 chat and its log, and a progress report across all papers. Clicking a question link in the results scrolls that question into view (results sit above the questions).

Answers, marks and chat are saved in `localStorage`; photos in IndexedDB. Everything stays on the device except what is sent to Gemini for marking or chat.

## Setup

1. For local marking with Gemini: copy `js/config.example.js` → `js/config.js` and add a Gemini API key (https://aistudio.google.com/apikey). Committed `js/config.js` only has a placeholder.
2. Open `index.html` in a browser, or serve the folder (`python3 -m http.server`) and open http://localhost:8000.

Without a key the options questions are still marked; a parent marks the handwritten answers with “Change this mark”.

### iPhone / iPad home screen

The page has a web-app manifest and Apple touch icon. Once it is served over https, open it in Safari → Share → **Add to Home Screen**. The home-screen app keeps its own saved progress, separate from Safari.

## Files

```
index.html               page layout
css/app.css              styles (Tailwind comes from the CDN)
js/core.js               shared helpers + TOPICS (syllabus topics for the report)
js/app.js                app logic: saving, marking, photos, Gemini, chat, report, PDFs
js/config.js             placeholder key; real key injected on Pages deploy
js/config.example.js     local settings template
.github/workflows/       Pages deploy + GEMINI_API_KEY injection
papers/*.js              one file per school; each calls TESTS.push({...})
img/                     composition pictures, app icons
fonts/noto-sans-sc-p4.js Chinese font for the PDFs (Noto Sans SC subset, OFL)
tools/build-font.py      rebuilds the PDF font
```

## Adding a paper

Create `papers/<school>.js` with `TESTS.push({...})` (copy an existing file) and add a `<script>` tag for it in `index.html` before `js/app.js`. Question types:

- `mcq` — `opts: [...]`, `ans: <1-4>`, `why: '<explanation>'`
- `bank` — 词语搭配; the section has `bank: [six words]`, the question has `ans: <1-6>`
- `write` — handwritten; `key` (model answer), `scheme` (marking scheme, in Chinese), optional `starter` (printed start of a note), `lines`
- `essay` — handwritten composition; `img`, `picture` (text description for Gemini), `panels` or `words`, `minChars`, `key`, `scheme`

Every question needs a `topic` from `TOPICS` in `js/core.js`. Helpers: `${B}` blank, `${QB(7)}` numbered blank in a passage, `${R('贩','fàn')}` pinyin, `P('para 1', 'para 2')` passage paragraphs.

If a new paper uses rare characters, rebuild the PDF font: `pip install fonttools && python3 tools/build-font.py` (needs Noto Sans CJK installed).
