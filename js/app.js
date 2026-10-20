/* =====================================================================
   P4 华文 Practice Papers — app logic
   - Questions with options on the paper (mcq, word bank) are answered on screen and marked automatically.
   - Questions with no options (written answers, compositions) have NO text box: the child writes on
     paper, adds photos, and Gemini reads the handwriting and marks it against the answer key.
   Settings (Gemini API key, parent PIN) live in js/config.js — on Pages the key is
   injected from GitHub secret GEMINI_API_KEY. See README.md.
   ===================================================================== */
const CFG = window.APP_CONFIG || {};
const _rawKey = (CFG.geminiApiKey || '').trim();
const GEMINI = {
  // apiKey comes from js/config.js — on Pages, injected from GitHub secret GEMINI_API_KEY.
  apiKey: (_rawKey && _rawKey !== '__GEMINI_API_KEY_PLACEHOLDER__') ? _rawKey : '',
  // Tried in this order. If one is overloaded (503), rate-limited (429) or missing (404), the next is used.
  models: CFG.geminiModels || ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'],
  autoDiscover: true, triesPerModel: 2, stickyMinutes: 30
};
const API_ON = !!GEMINI.apiKey;
/* Parent PIN. Only a hash is stored. To change it, open the browser console on this page,
   run  pinHash('1234')  and put the result in js/config.js as pinHash. */
const PIN_HASH = CFG.pinHash || 'c4f72bb0';

const STORE_KEY = 'p4chinese.v1';
const $id = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isHand = q => q.type === 'write' || q.type === 'essay';

/* ===================== SAVED PROGRESS (localStorage) ===================== */
let storageOK = true;
let store = loadStore();
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const s = raw ? JSON.parse(raw) : null;
    if (s && typeof s === 'object' && s.attempts) return s;
  } catch (_) { storageOK = false; }
  return { name: '', attempts: {} };
}
function saveStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); storageOK = true; }
  catch (_) { storageOK = false; }
  const w = $id('storage-warning'); if (w) w.classList.toggle('hidden', storageOK);
}
const freshAttempt = (history = []) => ({ status: 'new', answers: {}, results: null, photoCount: 0, chatLog: [], chatHistory: [], history });
const attemptFor = id => (store.attempts[id] ||= freshAttempt());

/* ===================== PHOTOS (IndexedDB, falls back to memory) ===================== */
const Photos = (() => {
  const mem = {}; let dbp = null;
  const open = () => dbp ??= new Promise(res => {
    try {
      const r = indexedDB.open('p4chinese', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    } catch (_) { res(null); }
  });
  const tx = async (mode, fn) => { const db = await open(); if (!db) return null; return new Promise(res => { try { const t = db.transaction('photos', mode); const req = fn(t.objectStore('photos')); t.oncomplete = () => res(req ? req.result : true); t.onerror = () => res(null); } catch (_) { res(null); } }); };
  return {
    async get(id) { const v = await tx('readonly', s => s.get(id)); return Array.isArray(v) ? v : (mem[id] || []); },
    async set(id, list) { mem[id] = list; await tx('readwrite', s => s.put(list, id)); },
    async clear(id) { delete mem[id]; await tx('readwrite', s => s.delete(id)); },
    async clearAll() { for (const k of Object.keys(mem)) delete mem[k]; await tx('readwrite', s => s.clear()); }
  };
})();

/* ===================== CURRENT PAPER STATE ===================== */
let TEST = null, QUESTIONS = [], att = null, photos = [];
let marked = false, results = {}, pinPassed = false, aiOverall = '', submittedAt = null, photosUnlocked = false;
let chatLog = [], chatHistory = [], chatBusy = false, activeQ = null;
const qById = id => QUESTIONS.find(q => q.id === id);
const sectionOf = id => TEST.sections.find(s => s.id === id);
const maxMarks = t => t.questions.reduce((s, q) => s + q.marks, 0);
const handQs = t => t.questions.filter(isHand);
const qLabel = q => (TEST?.kind === 'composition' ? '作文' : 'Q' + q.id);

/* ===================== LANDING PAGE ===================== */
function fmtShortDate(ts) { return ts ? new Date(ts).toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
function answeredCount(t, a) {
  if (!a || !a.answers) return 0;
  return t.questions.filter(q => !isHand(q) && hasAnswer(q, a.answers[q.id])).length;
}
function scoreOf(a) { return a && a.results ? Object.values(a.results).reduce((s, r) => s + (r.awarded || 0), 0) : 0; }
const pendingOf = (t, a) => a?.results ? t.questions.filter(q => a.results[q.id]?.pending).length : 0;

function testCard(t) {
  const a = store.attempts[t.id], max = maxMarks(t), objN = t.questions.filter(q => !isHand(q)).length, hn = handQs(t).length;
  let status, bar = '', btns;
  if (a?.status === 'marked') {
    const sc = scoreOf(a), pct = Math.round(sc / max * 100), col = pct >= 85 ? '#16a34a' : pct >= 60 ? '#2563eb' : pct >= 40 ? '#d97706' : '#dc2626';
    const pend = pendingOf(t, a);
    status = pend ? `<span class="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800">Written answers not marked yet</span>`
      : `<span class="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700">✓ Marked ${fmtShortDate(a.submittedAt)}</span>`;
    bar = `<div class="mt-3 flex items-center gap-3"><div class="text-2xl font-bold" style="color:${col}">${sc}<span class="text-sm text-slate-400 font-medium">/${max}</span></div><div class="bar flex-1"><span style="width:${pct}%;background:${col}"></span></div><span class="text-sm text-slate-500">${pct}%</span></div>`;
    btns = `<button type="button" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-2 rounded-lg" onclick="openTest('${t.id}')">Review</button><button type="button" class="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg" onclick="retakeTest('${t.id}')">Retake</button>`;
  } else if (a?.status === 'in-progress') {
    const c = answeredCount(t, a), total = objN + (hn ? 1 : 0), done = c + (hn && a.photoCount ? 1 : 0);
    status = `<span class="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800">In progress${objN ? ` · ${c}/${objN} answered` : ''}${hn ? ` · ${a.photoCount || 0} photo${a.photoCount === 1 ? '' : 's'}` : ''}</span>`;
    bar = `<div class="mt-3 bar"><span style="width:${Math.round(done / Math.max(1, total) * 100)}%;background:#f59e0b"></span></div>`;
    btns = `<button type="button" class="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold px-3 py-2 rounded-lg" onclick="openTest('${t.id}')">Continue</button>`;
  } else {
    status = `<span class="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">Not started</span>`;
    btns = `<button type="button" class="flex-1 bg-white border-2 border-red-600 text-red-700 hover:bg-red-50 font-semibold px-3 py-2 rounded-lg" onclick="openTest('${t.id}')">Start</button>`;
  }
  const hist = (a?.history || []).length ? `<div class="mt-2 text-xs text-slate-500">Earlier attempts: ${a.history.map(h => `${h.score}/${h.max} (${fmtShortDate(h.at)})`).join(', ')}</div>` : '';
  const what = t.kind === 'composition' ? `看图作文 · ${t.duration} · ${max} marks · handwritten` : `${t.questions.length} questions · ${max} marks · ${hn} handwritten`;
  return `<div class="bg-white rounded-2xl shadow p-5 flex flex-col">
    <div class="flex items-start justify-between gap-2"><div><h2 class="text-lg font-bold text-slate-800">${esc(t.school)}</h2><p class="text-sm text-slate-500">${esc(t.schoolEn)} · ${esc(t.paper)}</p><p class="text-xs text-slate-400 mt-0.5">${what}</p></div>${status}</div>
    ${bar}${hist}<div class="mt-4 flex gap-2">${btns}</div></div>`;
}
function renderLanding() {
  $id('student-name').value = store.name || '';
  const p2 = TESTS.filter(t => t.kind !== 'composition'), p1 = TESTS.filter(t => t.kind === 'composition');
  const done = TESTS.filter(t => store.attempts[t.id]?.status === 'marked');
  const inprog = TESTS.filter(t => store.attempts[t.id]?.status === 'in-progress');
  const avg = done.length ? Math.round(done.reduce((s, t) => s + scoreOf(store.attempts[t.id]) / maxMarks(t) * 100, 0) / done.length) : null;
  const best = done.length ? done.reduce((b, t) => { const p = scoreOf(store.attempts[t.id]) / maxMarks(t); return p > b.p ? { p, t } : b; }, { p: -1 }) : null;
  const tile = (v, l) => `<div class="bg-slate-50 border border-slate-200 rounded-xl p-3"><div class="text-2xl font-bold text-slate-800">${v}</div><div class="text-xs text-slate-500">${l}</div></div>`;
  $id('overall').innerHTML = tile(`${done.length}/${TESTS.length}`, 'papers marked') + tile(inprog.length, 'in progress') + tile(avg === null ? '–' : avg + '%', 'average score') + tile(best ? esc(best.t.short) : '–', 'best paper');
  $id('storage-warning').classList.toggle('hidden', storageOK);
  $id('api-warning').classList.toggle('hidden', API_ON);
  $id('test-list').innerHTML = p2.map(testCard).join('');
  $id('essay-list').innerHTML = p1.map(testCard).join('');
}
$id('student-name').addEventListener('input', e => { store.name = e.target.value; saveStore(); });

function goHome() {
  if (TEST && !marked) saveAnswers();
  TEST = null; closeChat(); document.body.classList.add('chat-hidden');
  $id('test-view').classList.add('hidden'); $id('landing').classList.remove('hidden');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  renderLanding(); window.scrollTo(0, 0);
}

async function retakeTest(id) {
  id = id || TEST?.id; if (!id) return;
  const t = TESTS.find(x => x.id === id), a = store.attempts[id];
  if (a?.status === 'marked' && !confirm(`Retake ${t.short}? Your answers, photos, marks and chat for this paper will be cleared (the score ${scoreOf(a)}/${maxMarks(t)} is kept in the history). Download the PDFs first if you want to keep them.`)) return;
  const hist = (a?.history || []).concat(a?.status === 'marked' ? [{ score: scoreOf(a), max: maxMarks(t), at: a.submittedAt }] : []);
  store.attempts[id] = freshAttempt(hist);
  saveStore(); await Photos.clear(id);
  openTest(id);
}

/* ===================== OPEN A PAPER ===================== */
async function openTest(id) {
  const t = TESTS.find(x => x.id === id); if (!t) return goHome();
  TEST = t; QUESTIONS = t.questions; att = attemptFor(id);
  marked = att.status === 'marked'; pinPassed = false; photosUnlocked = false;
  results = att.results || {}; aiOverall = att.aiOverall || ''; submittedAt = att.submittedAt ? new Date(att.submittedAt) : null;
  chatLog = att.chatLog ||= []; chatHistory = att.chatHistory ||= []; activeQ = null;

  $id('landing').classList.add('hidden'); $id('test-view').classList.remove('hidden');
  $id('test-title').textContent = `${t.school} ${t.kind === 'composition' ? '作文' : ''}`.trim();
  $id('test-sub').textContent = `${t.schoolEn} · 小四华文 ${t.exam} · ${t.paper} · ${t.duration} · 总分 ${maxMarks(t)} 分`;
  $id('test-student').textContent = store.name ? `Student: ${store.name}` : '';
  $id('save-status').textContent = '';
  history.replaceState(null, '', '#paper=' + id);

  renderQuiz();
  restoreAnswers(att.answers || {});
  photos = await Photos.get(id);
  if (TEST !== t) return;
  renderPhotoPanel();
  resetChat();
  $id('results-card').classList.add('hidden'); $id('api-overall').classList.add('hidden');
  ['retry-ai', 'remark-btn'].forEach(b => $id(b).classList.add('hidden'));
  const btn = $id('submit-btn'); btn.disabled = false; btn.classList.remove('opacity-50');
  $id('submit-area').classList.remove('hidden');
  document.body.classList.add('chat-hidden');
  if (marked) showMarkedState(false);
  window.scrollTo(0, 0);
}

/* ===================== RENDERING ===================== */
function inputHTML(q) {
  const sec = sectionOf(q.sec);
  switch (q.type) {
    case 'mcq': {
      const big = q.opts.every(o => o.length <= 2);
      return `<div class="grid gap-2 mt-3 ${big ? 'grid-cols-2 sm:grid-cols-4' : ''}">` + q.opts.map((o, i) => `
        <label class="opt flex items-center gap-3 p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer">
          <input type="radio" name="q${TEST.id}-${q.id}" value="${i + 1}" class="accent-red-600 w-4 h-4 shrink-0">
          <span class="text-slate-500">(${i + 1})</span><span class="min-w-0 ${big ? 'text-xl' : 'zh'}">${o}</span>
        </label>`).join('') + `</div>`;
    }
    case 'bank':
      return `<div class="bankpick">` + sec.bank.map((w, i) => `<label><input type="radio" name="q${TEST.id}-${q.id}" value="${i + 1}"><b>${i + 1}</b> ${w}</label>`).join('') + `</div>`;
    case 'write':
      return `<div class="handwrite">✍ <b>Write this answer on paper</b> — start with <b>Q${q.id}</b>. ${q.lines > 2 ? `Leave room for about ${q.lines} lines.` : ''}${q.starter ? `<div class="starter">${esc(q.starter)}</div><div class="mt-1 text-xs">Copy the start, then carry on writing.</div>` : ''}</div>`;
    case 'essay':
      return `<img class="essay-img" src="${q.img}" alt="作文图片 composition pictures">
        ${q.panels ? `<div class="grid grid-cols-2 gap-2 text-center text-sm max-w-md mx-auto">${q.panels.map((p, i) => `<div class="border border-slate-200 rounded-lg p-1.5">图${i + 1}：${p.join('、')}</div>`).join('')}</div>` : ''}
        ${q.words ? `<div class="mt-2 text-sm font-medium text-slate-600">参考词语</div><div class="wordlist">${q.words.map(w => `<span>${w}</span>`).join('')}</div>` : ''}
        <div class="handwrite">✍ <b>Write your composition on paper</b> (at least ${q.minChars} 字), then take a clear photo of every page. Give it a title if you like.</div>`;
  }
  return '';
}

function renderQuiz() {
  const hq = handQs(TEST);
  const how = $id('paper-howto');
  if (hq.length) {
    how.classList.remove('hidden');
    how.innerHTML = TEST.kind === 'composition'
      ? `✍ <b>This paper is written by hand.</b> Write your composition on paper in ${TEST.duration}, then add photos of every page at the bottom and press Submit. Gemini reads your handwriting and marks it.`
      : `<b>How to do this paper:</b> answer the questions with options on screen. Questions marked ✍ (${hq.map(q => 'Q' + q.id).join(', ')}) have no options, so <b>write those answers on paper</b>, starting each answer with its question number. When you finish, add photos of your paper at the bottom and press Submit. Gemini reads your handwriting and marks it.`;
  } else how.classList.add('hidden');

  $id('sections').innerHTML = TEST.sections.map(s => `
    <section class="mb-10">
      <h2 class="text-2xl font-semibold text-slate-700 mb-1 border-b pb-2">${s.title}<span class="text-base text-slate-400 font-normal">（${s.marks}分）</span></h2>
      <p class="text-sm text-slate-500 mb-4">${s.desc}</p>
      ${s.passage ? `<div class="passage zh">${s.passage}</div>` : ''}
      ${s.bank ? `<div class="bankbox">${s.bank.map((w, i) => `<div>${i + 1}. ${w}</div>`).join('')}</div>` : ''}
      <div id="section-${s.id}" class="space-y-5"></div>
    </section>`).join('');
  QUESTIONS.forEach(q => {
    const sbox = $id('section-' + q.sec);
    const marks = isHand(q) ? ` <span class="text-slate-400 text-sm">（${q.marks}分）</span>` : '';
    sbox.insertAdjacentHTML('beforeend', `
      <div class="qcard bg-white p-5 rounded-xl border border-slate-200 shadow-sm" id="card-${q.id}" data-qid="${q.id}">
        <div class="flex justify-between items-start gap-3">
          <div class="font-medium text-slate-800 min-w-0 zh">${q.type === 'essay' ? '' : `<span class="text-slate-500 mr-1">Q${q.id}.</span>`}${isHand(q) ? '✍ ' : ''}${q.q}${marks}</div>
          <div class="flex items-center gap-2 shrink-0">
            <button type="button" class="ask-btn hidden text-sm font-medium px-2 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100" onclick="askAbout('${q.id}')">💬 Ask</button>
            <span class="badge hidden shrink-0 text-sm font-bold px-2 py-1 rounded-lg"></span>
          </div>
        </div>
        ${inputHTML(q)}
        <div class="fb hidden mt-4 text-sm"></div>
      </div>`);
  });
  $id('quiz-form').oninput = $id('quiz-form').onchange = e => { if (!marked && e.target.id !== 'photo-input') scheduleSave(); };
}

/* ===================== ANSWER CAPTURE / RESTORE ===================== */
function captureAnswer(q, card) {
  if (isHand(q)) return {};
  const s = card.querySelector('input[type=radio]:checked');
  return s ? { pick: s.value } : {};
}
function restoreAnswers(answers) {
  QUESTIONS.forEach(q => {
    const v = answers[q.id], card = $id('card-' + q.id); if (!v || !card || !v.pick) return;
    const r = card.querySelector(`input[value="${v.pick}"]`); if (r) r.checked = true;
  });
}
const hasAnswer = (q, v) => !!(v && v.pick);
let saveTimer = null;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveAnswers, 400); }
function saveAnswers() {
  if (!TEST || !att) return;
  clearTimeout(saveTimer);
  const answers = {};
  QUESTIONS.forEach(q => { const card = $id('card-' + q.id); if (card) answers[q.id] = captureAnswer(q, card); });
  att.answers = answers; att.photoCount = photos.length;
  if (!marked) att.status = (QUESTIONS.some(q => hasAnswer(q, answers[q.id])) || photos.length) ? 'in-progress' : (att.status === 'in-progress' ? 'in-progress' : 'new');
  att.updated = Date.now();
  saveStore();
  $id('save-status').textContent = storageOK ? `Saved ${new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}` : 'Not saved (storage blocked)';
}

/* ===================== PHOTO PANEL ===================== */
function renderPhotoPanel() {
  const hq = handQs(TEST), panel = $id('photo-panel');
  panel.classList.toggle('hidden', !hq.length);
  if (!hq.length) return;
  panel.classList.toggle('photo-panel-locked', marked && !photosUnlocked);
  $id('photo-help').innerHTML = TEST.kind === 'composition'
    ? 'Add a photo of every page of your composition, in order.'
    : `Add photos of your answers to <b>${hq.map(q => 'Q' + q.id).join(', ')}</b>. Make sure every answer starts with its question number.`;
  $id('photo-grid').innerHTML = photos.map((p, i) => `<figure><img src="${p.dataUrl}" alt="Photo ${i + 1}" data-i="${i}"><figcaption>Photo ${i + 1}</figcaption><button type="button" data-del="${i}" aria-label="Remove photo ${i + 1}">×</button></figure>`).join('');
  $id('photo-status').textContent = photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''} added` : 'No photos yet';
}
$id('photo-grid').addEventListener('click', async e => {
  const del = e.target.closest('[data-del]'), img = e.target.closest('img[data-i]');
  if (del && (!marked || photosUnlocked)) { photos.splice(+del.dataset.del, 1); await Photos.set(TEST.id, photos); renderPhotoPanel(); saveAnswers(); }
  else if (img) { $id('photo-viewer-img').src = photos[+img.dataset.i].dataUrl; const v = $id('photo-viewer'); v.classList.remove('hidden'); v.classList.add('flex'); }
});
function closeViewer() { const v = $id('photo-viewer'); v.classList.add('hidden'); v.classList.remove('flex'); }
$id('photo-input').addEventListener('change', async e => {
  const files = [...e.target.files]; e.target.value = '';
  if (!files.length || !TEST || (marked && !photosUnlocked)) return;
  const t = TEST; $id('photo-status').textContent = 'Adding photos…';
  for (const f of files) {
    if (photos.length >= 12) { alert('You can add up to 12 photos.'); break; }
    try { photos.push(await compressImage(f)); }
    catch (_) { alert(`“${f.name}” couldn't be opened as a picture. Please try a JPEG or PNG photo.`); }
  }
  if (TEST !== t) return;
  await Photos.set(t.id, photos); renderPhotoPanel(); saveAnswers();
});
function compressImage(file, maxDim = 1800, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), dataUrl: c.toDataURL('image/jpeg', quality), w, h, at: Date.now() });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

/* ===================== MARKING (objective questions) ===================== */
const bankWord = q => sectionOf(q.sec).bank;
const bankPhrase = (q, n) => q.q.replace(/（[\s　]*）/, bankWord(q)[n - 1]);
const correctAnswerText = q => q.type === 'mcq' ? `(${q.ans}) ${plain(q.opts[q.ans - 1])}` : q.type === 'bank' ? `(${q.ans}) ${bankPhrase(q, q.ans)}` : q.key;
function grade(q, card) {
  const r = { awarded: 0, max: q.marks, correct: false, note: '', given: '' };
  const s = card.querySelector('input[type=radio]:checked');
  if (s) {
    const n = +s.value;
    r.given = q.type === 'mcq' ? `(${n}) ${plain(q.opts[n - 1])}` : `(${n}) ${bankPhrase(q, n)}`;
    r.correct = n === q.ans;
  }
  if (r.correct) r.awarded = q.marks;
  return r;
}
function plain(html) {
  const d = document.createElement('div'); d.innerHTML = html || '';
  d.querySelectorAll('rt').forEach(e => e.remove());
  d.querySelectorAll('.blank').forEach(e => e.replaceWith('＿＿＿'));
  d.querySelectorAll('.qblank').forEach(e => e.replaceWith(`（Q${e.dataset.q}）`));
  d.querySelectorAll('br,p,li,div').forEach(e => e.after(' '));
  return d.textContent.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ').trim();
}

/* ===================== FEEDBACK DISPLAY ===================== */
function showFeedback(q, card, r) {
  const badge = card.querySelector('.badge'), fb = card.querySelector('.fb');
  fb.classList.remove('hidden');
  card.classList.remove('border-slate-200', 'border-green-300', 'border-red-300', 'border-amber-300');
  if (r.pending) {
    badge.textContent = `?/${q.marks}`; badge.className = 'badge shrink-0 text-sm font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-500';
    card.classList.add('border-slate-200');
    fb.innerHTML = `<div class="text-slate-600">⏳ ${esc(r.note || 'Waiting for the photos of your written answers to be marked.')}</div>`;
    return;
  }
  const full = r.awarded === q.marks, none = r.awarded === 0;
  badge.textContent = `${r.awarded}/${q.marks}`;
  badge.className = 'badge shrink-0 text-sm font-bold px-2 py-1 rounded-lg ' + (full ? 'bg-green-100 text-green-700' : none ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700');
  card.classList.add(full ? 'border-green-300' : none ? 'border-red-300' : 'border-amber-300');
  const blank = isHand(q) ? !r.transcript : !r.given;
  const verdict = full ? '<span class="text-green-700 font-semibold">✓ Correct 正确</span>'
    : none ? (blank ? '<span class="text-red-700 font-semibold">✗ Not answered 没有作答</span>' : '<span class="text-red-700 font-semibold">✗ Not quite 不对</span>')
    : '<span class="text-amber-700 font-semibold">Partly correct 部分正确</span>';
  let h = `<div>${verdict}${r.adjusted ? ' <span class="text-xs text-slate-500">(mark set by a parent)</span>' : ''}${r.note ? ` <span class="text-slate-600">— ${esc(r.note)}</span>` : ''}</div>`;
  if (isHand(q)) {
    if (r.transcript) h += `<div class="mt-2 text-slate-600">What Gemini read from your paper:</div><div class="transcript">${esc(r.transcript)}</div>`;
    if (r.parts) h += `<div class="mt-2 text-slate-600">内容 Content <b>${r.parts.content}</b>/6 · 语文 Language <b>${r.parts.language}</b>/6 · 组织 Organisation <b>${r.parts.organisation}</b>/3</div>`;
    if (r.feedback) h += `<div class="mt-2 p-3 rounded-lg bg-red-50 border border-red-100"><div class="font-semibold text-red-800 mb-1">Feedback</div><div style="white-space:pre-wrap">${esc(r.feedback)}</div></div>`;
    if (r.better && !full) h += `<div class="mt-2 text-slate-600">${q.type === 'essay' ? 'Better sentences 好句子' : 'A full-marks answer 参考答案'}:</div><div class="transcript">${esc(r.better)}</div>`;
    if (q.type === 'write') h += `<details class="mt-2" ${full || r.better ? '' : 'open'}><summary class="cursor-pointer text-red-700 font-medium select-none">Answer key 答案</summary><div class="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 zh">${esc(q.key)}<div class="mt-2 text-xs text-slate-500">评分：${esc(q.scheme)}</div></div></details>`;
    else h += `<details class="mt-2"><summary class="cursor-pointer text-red-700 font-medium select-none">What a good composition needs</summary><div class="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 zh">${esc(q.key)}<div class="mt-2 text-xs text-slate-500">${esc(q.scheme)}</div></div></details>`;
    h += `<div class="mt-2"><button type="button" class="adj-btn text-xs text-slate-500 hover:text-slate-800 underline" onclick="adjustMark('${q.id}')">🔒 Change this mark</button><span class="adj-box"></span></div>`;
  } else {
    if (r.given) h += `<div class="mt-1 text-slate-600">Your answer: <span class="font-medium zh">${esc(r.given)}</span></div>`;
    if (!full) h += `<div class="mt-1 text-slate-600">Correct answer: <span class="font-semibold zh">${esc(correctAnswerText(q))}</span></div>`;
    if (q.why) h += `<div class="mt-2 p-3 rounded-lg bg-slate-50 border border-slate-200 leading-relaxed">💡 ${esc(q.why)}</div>`;
  }
  fb.innerHTML = h;
}

const secLabel = s => s.title.replace(/^[（(][一二三四五六][）)]|^[一二三四五六]、/, '').trim();
function updateSummary(status) {
  const secMax = {}, secGot = {};
  TEST.sections.forEach(s => { secMax[s.id] = 0; secGot[s.id] = 0; });
  QUESTIONS.forEach(q => { secMax[q.sec] += q.marks; secGot[q.sec] += results[q.id]?.awarded || 0; });
  const total = Object.values(secGot).reduce((a, b) => a + b, 0), max = maxMarks(TEST);
  const pend = QUESTIONS.filter(q => results[q.id]?.pending);
  $id('score-display').innerHTML = `${total} / ${max}${pend.length ? `<div class="text-sm font-medium text-amber-700 mt-1">+ up to ${pend.reduce((s, q) => s + q.marks, 0)} marks for written answers not marked yet</div>` : ''}`;
  $id('section-scores').innerHTML = TEST.sections.length > 1 ? TEST.sections.map(s => `<span class="bg-white border border-red-100 rounded-lg px-3 py-1">${esc(secLabel(s))}: <b>${secGot[s.id]}</b> / ${secMax[s.id]}</span>`).join('') : '';
  if (status !== undefined) { $id('marking-status').textContent = status; if (att) att.markingStatus = status; }
  const missed = QUESTIONS.filter(q => !results[q.id]?.pending && (results[q.id]?.awarded || 0) < q.marks);
  $id('review-links').innerHTML = TEST.kind === 'composition' ? '' : missed.length
    ? `<div class="font-medium text-slate-700 mb-2">Review these ${missed.length} question${missed.length > 1 ? 's' : ''}:</div><div class="flex flex-wrap justify-center gap-1.5">` +
      missed.map(q => { const part = (results[q.id]?.awarded || 0) > 0; return `<a href="#card-${q.id}" data-q="${q.id}" class="inline-block px-2 py-0.5 rounded-md border text-sm font-medium no-underline ${part ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100' : 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'}">Q${q.id}</a>`; }).join('') + `</div>`
    : (pend.length ? '' : '🎉 Full marks — 太棒了！');
  renderTopicReport();
  $id('retry-ai').classList.toggle('hidden', !(marked && pend.length && API_ON && photos.length));
  $id('remark-btn').classList.toggle('hidden', !(marked && handQs(TEST).length));
}
$id('review-links').addEventListener('click', e => { const a = e.target.closest('a[data-q]'); if (!a) return; e.preventDefault(); focusQuestion(a.dataset.q); });

function lockCards() {
  QUESTIONS.forEach(q => { const card = $id('card-' + q.id); card.classList.add('locked'); card.querySelectorAll('input').forEach(el => el.disabled = true); });
  const btn = $id('submit-btn'); btn.disabled = true; btn.classList.add('opacity-50');
  $id('submit-area').classList.add('hidden');
}
function showMarkedState(fresh) {
  marked = true;
  lockCards(); renderPhotoPanel();
  QUESTIONS.forEach(q => { const card = $id('card-' + q.id); if (results[q.id]) showFeedback(q, card, results[q.id]); });
  document.querySelectorAll('.ask-btn').forEach(b => b.classList.remove('hidden'));
  document.body.classList.remove('chat-hidden');
  setChatLocked(false);
  const notes = $id('paper-notes');
  if (TEST.notes?.length) { notes.classList.remove('hidden'); notes.querySelector('ul').innerHTML = TEST.notes.map(n => `<li>${esc(n)}</li>`).join(''); } else notes.classList.add('hidden');
  showOverall();
  $id('results-card').classList.remove('hidden');
  if (!fresh) { updateSummary(att.markingStatus || 'Marked.'); restoreChat(); }
}
function showOverall() { const box = $id('api-overall'); if (aiOverall) { box.textContent = aiOverall; box.style.whiteSpace = 'pre-wrap'; box.classList.remove('hidden'); } else box.classList.add('hidden'); }

/* ===================== PARENT PIN ===================== */
let pinFails = 0, pinLockUntil = 0, pinAction = null;
function pinHash(pin) {
  let x = 0x811c9dc5;
  for (const c of 'p4maths|' + String(pin).trim()) { x ^= c.codePointAt(0); x = Math.imul(x, 0x01000193) >>> 0; }
  return x.toString(16).padStart(8, '0');
}
function askPin({ title, msg, okLabel, blanks }, onOk) {
  pinAction = onOk;
  $id('pin-title').textContent = title; $id('pin-msg').textContent = msg; $id('pin-ok').textContent = okLabel;
  const b = $id('pin-blanks'); b.innerHTML = blanks || ''; b.classList.toggle('hidden', !blanks);
  $id('pin-error').textContent = '';
  const m = $id('pin-modal'); m.classList.remove('hidden'); m.classList.add('flex');
  const i = $id('pin-input'); i.value = ''; setTimeout(() => i.focus(), 30);
}
function openPin() {
  if (marked) return;
  saveAnswers();
  const blanks = QUESTIONS.filter(q => !isHand(q) && !hasAnswer(q, captureAnswer(q, $id('card-' + q.id)))).length;
  const hq = handQs(TEST), warn = [];
  if (blanks) warn.push(`⚠ ${blanks} question${blanks > 1 ? 's are' : ' is'} not answered yet. They will get 0 marks.`);
  if (hq.length && !photos.length) warn.push(`⚠ No photos of the written answers have been added, so ${TEST.kind === 'composition' ? 'the composition' : hq.map(q => 'Q' + q.id).join(', ')} can't be marked yet. You can add photos after marking (PIN needed).`);
  else if (hq.length && !API_ON) warn.push('⚠ Gemini is not set up, so a parent will need to mark the written answers by hand.');
  else if (hq.length) warn.push(`📷 ${photos.length} photo${photos.length > 1 ? 's' : ''} of written answers will be sent to Gemini for marking.`);
  askPin({ title: 'Parent PIN needed', msg: 'Ask a parent or teacher to enter the PIN to mark this paper.', okLabel: 'Mark paper', blanks: warn.join('<br>') }, () => { pinPassed = true; submitTest(); });
}
function closePin() { const m = $id('pin-modal'); m.classList.add('hidden'); m.classList.remove('flex'); pinAction = null; }
function checkPin() {
  const err = $id('pin-error'), input = $id('pin-input');
  const wait = Math.ceil((pinLockUntil - Date.now()) / 1000);
  if (wait > 0) { err.textContent = `Too many tries. Please wait ${wait} s.`; return; }
  if (pinHash(input.value) === PIN_HASH) { pinFails = 0; const act = pinAction; closePin(); if (act) act(); return; }
  pinFails++; input.value = '';
  const box = $id('pin-box'); box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
  if (pinFails >= 3) { pinLockUntil = Date.now() + 30000; pinFails = 0; err.textContent = 'Wrong PIN 3 times. Please wait 30 s.'; }
  else err.textContent = 'Wrong PIN, please try again.';
  input.focus();
}
$id('pin-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkPin(); } if (e.key === 'Escape') closePin(); });

function resetAllData() {
  askPin({ title: 'Clear all saved data?', msg: 'This deletes every saved answer, photo, mark and chat on this device. Enter the parent PIN to confirm.', okLabel: 'Clear everything' }, async () => {
    store = { name: '', attempts: {} }; saveStore(); await Photos.clearAll(); renderLanding();
  });
}

/* parent can change a handwritten mark (e.g. Gemini misread a word) */
function adjustMark(id) {
  const q = qById(id), card = $id('card-' + id);
  askPin({ title: 'Change this mark?', msg: `Set the mark for ${qLabel(q)} yourself, for example if Gemini misread the handwriting.`, okLabel: 'Continue' }, () => {
    const box = card.querySelector('.adj-box');
    box.innerHTML = ` <select class="inp text-sm ml-2">${Array.from({ length: q.marks + 1 }, (_, i) => `<option value="${i}" ${i === (results[id]?.awarded || 0) ? 'selected' : ''}>${i} / ${q.marks}</option>`).join('')}</select> <button type="button" class="text-sm font-medium text-red-700 ml-1">Save</button>`;
    box.querySelector('button').onclick = () => {
      const r = results[id] ||= { max: q.marks };
      r.awarded = +box.querySelector('select').value; r.adjusted = true; r.pending = false;
      att.results = results; saveStore(); showFeedback(q, card, r); updateSummary();
    };
  });
}

/* ===================== SUBMIT ===================== */
async function submitTest() {
  if (marked) return;
  if (!pinPassed) { openPin(); return; }
  saveAnswers();
  results = {};
  QUESTIONS.forEach(q => {
    if (isHand(q)) results[q.id] = { awarded: 0, max: q.marks, pending: true, note: !photos.length ? 'No photos were added. A parent can add photos and mark this.' : API_ON ? 'Gemini is reading your handwriting…' : 'Gemini is not set up — a parent can mark this by hand.' };
    else results[q.id] = grade(q, $id('card-' + q.id));
  });
  submittedAt = new Date(); aiOverall = '';
  Object.assign(att, { status: 'marked', results, submittedAt: submittedAt.getTime(), aiOverall: '', photoCount: photos.length });
  saveStore();
  showMarkedState(true);
  addMsg('assistant', "Hi, I'm 华文小帮手, your Chinese Buddy! Your paper has been marked. Press 💬 Ask next to any question, or type a question number like Q12, and I'll help you understand it.");
  const hq = handQs(TEST), willMark = hq.length && photos.length && API_ON;
  updateSummary(willMark ? 'Options questions marked. Gemini is now reading the photos of your written answers (this can take a minute or two)…' : hq.length ? 'Options questions marked. Written answers are waiting to be marked.' : 'Marked automatically.');
  saveStore();
  $id('results-card').scrollIntoView({ behavior: 'smooth' });
  if (willMark) await markWritten();
}

/* ===================== GEMINI: MARK HANDWRITTEN ANSWERS ===================== */
const WRITTEN_PROMPT = `You are a kind, careful Singapore primary school Chinese Language teacher marking a Primary 4 practice paper.
You receive photos of the student's HANDWRITTEN answers on paper, plus JSON describing each handwritten question: its id, marks, the question, the reading passage or notice it is about, the expected answer and the marking scheme (评分).

For EVERY question id in the JSON:
1. Find the student's answer in the photos. Answers should start with the question number (e.g. "Q19", "19.", "19)", "第19题"). For a composition, the whole of the writing is the answer (it may run over several photos, in order).
2. transcript: copy exactly what the student wrote, in simplified Chinese, keeping their wrong characters and punctuation as written. Write □ for a character you cannot read. If the answer is not in any photo, set found to false and transcript to "".
3. awarded: marks according to the marking scheme. Accept answers that have the same meaning as the expected answer even if worded differently. For a one-word answer ("…的词语是"), the word must be exactly right. For notes/messages (便条/短信), give the content marks and language (语文/语法) marks as the scheme says; take language marks off for many wrong characters or ungrammatical sentences. Never give more than the question's marks. If found is false, awarded is 0.
4. feedback: 1–3 short sentences in simple English for a 10-year-old (a parent will read it too), speaking to the student as "you". Say what was right, then the specific thing that lost marks. Quote Chinese words in Chinese, and point out wrong characters like: you wrote 「X」, it should be 「Y」. If not found, say the answer wasn't in the photos.
5. betterAnswer: if not full marks, a short full-marks answer in simple Chinese, close to what the student tried to say; otherwise "".
For a composition (type "essay"): also give parts {content (0-6), language (0-6), organisation (0-3)} with awarded = their sum; feedback 3–5 sentences (what was good, the two most useful things to improve, and wrong characters); betterAnswer: 2–3 improved sentences taken from the student's own story (not a whole essay). Take marks off if it is shorter than the minimum number of characters.
photoIssues: one short sentence if any photo is blurry, cut off, upside down or seems to be missing a page; otherwise "".
overallFeedback: 3–4 sentences in simple English to the student about the whole paper (the JSON also lists the options questions and whether they were right): what they did well, the two things to practise most, and encouragement.
Plain text only, no markdown.`;
const PART = { type: 'OBJECT', properties: { content: { type: 'INTEGER' }, language: { type: 'INTEGER' }, organisation: { type: 'INTEGER' } } };
const WRITTEN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overallFeedback: { type: 'STRING' }, photoIssues: { type: 'STRING' },
    results: { type: 'ARRAY', items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, found: { type: 'BOOLEAN' }, transcript: { type: 'STRING' }, awarded: { type: 'INTEGER' }, feedback: { type: 'STRING' }, betterAnswer: { type: 'STRING' }, parts: PART }, required: ['id', 'found', 'transcript', 'awarded', 'feedback', 'betterAnswer'] } }
  },
  required: ['overallFeedback', 'photoIssues', 'results']
};
const parseJsonText = text => JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));

async function markWritten() {
  const t = TEST, a = att, res = results, qs = QUESTIONS, pics = photos.slice();
  const here = () => TEST === t;
  const hq = qs.filter(isHand);
  const payload = {
    student: store.name || '', paper: `${t.schoolEn} (${t.school}) P4 华文 ${t.exam} ${t.paper} – practice`,
    handwrittenQuestions: hq.map(q => {
      const sec = t.sections.find(s => s.id === q.sec);
      return { id: q.id, type: q.type, marks: q.marks, question: plain(q.q), passage: sec.passage ? plain(sec.passage) : '',
        ...(q.starter ? { printedStart: q.starter } : {}), ...(q.picture ? { pictures: q.picture, suggestedWords: (q.words || q.panels?.flat() || []).join('、'), minimumCharacters: q.minChars } : {}),
        expectedAnswer: q.key, markingScheme: q.scheme };
    }),
    optionsQuestions: qs.filter(q => !isHand(q)).map(q => ({ id: q.id, skill: TOPICS[q.topic]?.zh, right: !!res[q.id]?.correct, answered: !!res[q.id]?.given }))
  };
  const parts = [{ text: JSON.stringify(payload) }];
  pics.forEach((p, i) => { parts.push({ text: `Photo ${i + 1} of ${pics.length}:` }); parts.push({ inline_data: { mime_type: 'image/jpeg', data: p.dataUrl.split(',')[1] } }); });
  const body = { systemInstruction: { parts: [{ text: WRITTEN_PROMPT }] }, contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: WRITTEN_SCHEMA, temperature: 0.1 } };
  const status = s => { a.markingStatus = 'Options questions marked. ' + s; if (here()) updateSummary(a.markingStatus); };
  if (here()) $id('retry-ai').classList.add('hidden');
  try {
    let data, model;
    for (let i = 0; i < 2 && !data; i++) {
      const r = await callGemini(body, { attemptTimeoutMs: 150000, budgetMs: 330000, onStatus: status });
      model = r.model;
      try { data = parseJsonText(r.text); } catch (_) { if (i === 1) throw new Error('Gemini sent an incomplete reply'); status('Reply was incomplete, asking again…'); }
    }
    hq.forEach(q => {
      const x = (data.results || []).find(y => String(y.id).replace(/^Q/i, '') === q.id) || { found: false, transcript: '', awarded: 0, feedback: 'This answer was not found in the photos.', betterAnswer: '' };
      const r = res[q.id] = { max: q.marks, pending: false, found: !!x.found, transcript: x.found ? (x.transcript || '') : '', feedback: x.feedback || '', better: x.betterAnswer || '' };
      let aw = Math.round(Number(x.awarded) || 0);
      if (q.type === 'essay' && x.parts) {
        const c = v => Math.max(0, Math.round(Number(v) || 0));
        r.parts = { content: Math.min(6, c(x.parts.content)), language: Math.min(6, c(x.parts.language)), organisation: Math.min(3, c(x.parts.organisation)) };
        aw = r.parts.content + r.parts.language + r.parts.organisation;
      }
      r.awarded = x.found ? Math.max(0, Math.min(q.marks, aw)) : 0;
      r.correct = r.awarded === q.marks; r.given = r.transcript;
      r.note = x.found ? '' : 'Not found in the photos.';
      if (here()) showFeedback(q, $id('card-' + q.id), r);
    });
    a.aiOverall = data.overallFeedback || ''; a.photoIssues = data.photoIssues || '';
    a.markingStatus = `Marked: options questions automatically, written answers by Gemini (${model}) from ${pics.length} photo${pics.length > 1 ? 's' : ''}.${a.photoIssues ? ' Photo note: ' + a.photoIssues : ''} A parent can change any written mark.`;
    saveStore();
    if (here()) { aiOverall = a.aiOverall; showOverall(); updateSummary(a.markingStatus); }
  } catch (e) {
    a.markingStatus = `Gemini couldn't mark the written answers: ${friendlyError(e)} The options questions are marked.`;
    saveStore();
    if (here()) updateSummary(a.markingStatus);
  }
}
function retryWrittenMarking() { if (marked && photos.length) { QUESTIONS.filter(isHand).forEach(q => { const r = results[q.id]; if (r?.pending) { r.note = 'Gemini is reading your handwriting…'; showFeedback(q, $id('card-' + q.id), r); } }); markWritten(); } }
function reopenPhotos() {
  askPin({ title: 'Change photos and re-mark?', msg: 'Unlocks the photo area so you can add or remove photos, then marks the written answers again.', okLabel: 'Unlock photos' }, () => {
    photosUnlocked = true; renderPhotoPanel();
    const panel = $id('photo-panel');
    if (!panel.querySelector('#remark-now')) panel.insertAdjacentHTML('beforeend', `<div class="mt-4"><button type="button" id="remark-now" class="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg">✓ Done — mark written answers again</button></div>`);
    $id('remark-now').onclick = async () => {
      if (!photos.length) { alert('Add at least one photo first.'); return; }
      if (!API_ON) { alert('Gemini is not set up (js/config.js). Use “Change this mark” on each written answer instead.'); return; }
      photosUnlocked = false; $id('remark-now').parentElement.remove(); renderPhotoPanel();
      att.photoCount = photos.length;
      QUESTIONS.filter(isHand).forEach(q => { results[q.id] = { awarded: 0, max: q.marks, pending: true, note: 'Gemini is reading your handwriting…' }; showFeedback(q, $id('card-' + q.id), results[q.id]); });
      att.results = results; saveStore(); updateSummary('Gemini is reading the new photos…');
      $id('results-card').scrollIntoView({ behavior: 'smooth' });
      await markWritten();
    };
    panel.scrollIntoView({ behavior: 'smooth' });
  });
}

/* ===================== RESILIENT GEMINI CLIENT ===================== */
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const STICKY_KEY = 'p4chinese.workingModel';
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const deadModels = new Set();
let modelListPromise = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const backoff = attempt => 1000 * 2 ** (attempt - 1) + Math.random() * 500;
function readSticky() { try { const s = JSON.parse(localStorage.getItem(STICKY_KEY) || 'null'); return s && Date.now() - s.t < GEMINI.stickyMinutes * 60000 ? s.model : null; } catch (_) { return null; } }
function writeSticky(model) { try { localStorage.setItem(STICKY_KEY, JSON.stringify({ model, t: Date.now() })); } catch (_) {} }
async function discoverModels() {
  if (!GEMINI.autoDiscover) return [];
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${GEMINI_BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': GEMINI.apiKey }, signal: ctrl.signal });
    if (!res.ok) return [];
    const j = await res.json();
    return (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace(/^models\//, ''))
      .filter(n => /flash/.test(n) && !/(tts|image|live|audio|embed|exp|preview|thinking|8b)/.test(n)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  } catch (_) { return []; } finally { clearTimeout(t); }
}
function modelList() { modelListPromise ??= discoverModels().then(found => [...GEMINI.models, ...found.filter(m => !GEMINI.models.includes(m)).slice(0, 3)]); return modelListPromise; }
function friendlyError(e) {
  const s = e?.status, m = String(e?.message || '');
  if (s === 401 || s === 403 || /api key/i.test(m)) return 'The Gemini API key was rejected — check the GEMINI_API_KEY secret / js/config.js and the key\'s restrictions.';
  if (s === 413 || /too large|payload/i.test(m)) return 'The photos are too large to send. Try fewer photos.';
  if (s === 429 || s === 503 || /overload|high demand|exhausted/i.test(m)) return 'Gemini is very busy right now. Please wait a minute and try again.';
  if (/timed out/i.test(m)) return 'Gemini took too long to reply. Please try again.';
  if (/network/i.test(m)) return 'Couldn\'t reach Gemini — check your internet connection.';
  return m || 'Something went wrong.';
}
async function callGemini(body, { attemptTimeoutMs = 30000, budgetMs = 90000, onStatus = () => {} } = {}) {
  if (!GEMINI.apiKey) throw new Error('no API key set');
  const start = Date.now();
  let lastErr = null, models = (await modelList()).filter(m => !deadModels.has(m));
  const sticky = readSticky();
  if (sticky && models.includes(sticky)) models = [sticky, ...models.filter(m => m !== sticky)];
  for (let mi = 0; mi < models.length; mi++) {
    const model = models[mi];
    for (let attempt = 1; attempt <= GEMINI.triesPerModel; attempt++) {
      const left = budgetMs - (Date.now() - start);
      if (left < 3000) throw lastErr || new Error('timed out');
      if (attempt > 1) onStatus(`Gemini is busy, retrying ${model}…`); else if (mi > 0) onStatus(`Trying another model (${model})…`);
      const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), Math.min(attemptTimeoutMs, left));
      let res, json;
      try {
        res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI.apiKey }, body: JSON.stringify(body), signal: ctrl.signal });
        json = await res.json().catch(() => ({}));
      } catch (e) {
        lastErr = new Error(e.name === 'AbortError' ? 'timed out' : 'network error: ' + e.message);
        if (e.name === 'AbortError') break;
        if (attempt < GEMINI.triesPerModel) await sleep(backoff(attempt));
        continue;
      } finally { clearTimeout(t); }
      if (res.ok) {
        const text = (json?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
        if (text) { writeSticky(model); return { text, model }; }
        lastErr = new Error(json?.promptFeedback?.blockReason ? 'blocked: ' + json.promptFeedback.blockReason : 'empty reply');
        continue;
      }
      const msg = json?.error?.message || '';
      lastErr = new Error(`HTTP ${res.status}${msg ? ': ' + msg : ''}`); lastErr.status = res.status;
      if (res.status === 401 || res.status === 403 || /api key/i.test(msg)) throw lastErr;
      if (res.status === 404) { deadModels.add(model); break; }
      if (res.status === 413) throw lastErr;
      if (RETRYABLE.has(res.status)) {
        if (attempt < GEMINI.triesPerModel) { const ra = Number(res.headers.get('retry-after')); await sleep(Math.min(isFinite(ra) && ra > 0 ? ra * 1000 : backoff(attempt), 8000)); }
        continue;
      }
      break;
    }
  }
  throw lastErr || new Error('no Gemini model available');
}

/* ===================== STRENGTHS AND WEAK AREAS ===================== */
function buildTopicReport(t, res) {
  const qs = t.questions, by = {};
  let blankMarks = 0, blankRun = [], longestRun = [], pendingMarks = 0;
  const isBlank = (q, r) => isHand(q) ? (!r.pending && !r.transcript) : !r.given;
  qs.forEach(q => {
    const r = res[q.id] || { awarded: 0 };
    if (r.pending) { pendingMarks += q.marks; return; }
    const tp = by[q.topic] ||= { topic: q.topic, got: 0, max: 0, n: 0, full: [], part: [], wrong: [], blank: [] };
    tp.got += r.awarded || 0; tp.max += q.marks; tp.n++;
    const b = isBlank(q, r);
    (b ? tp.blank : r.awarded === q.marks ? tp.full : r.awarded > 0 ? tp.part : tp.wrong).push(q);
    if (b) { blankMarks += q.marks; blankRun.push(q); if (blankRun.length > longestRun.length) longestRun = blankRun.slice(); } else blankRun = [];
  });
  const rows = Object.values(by).map(tp => {
    const pct = tp.max ? tp.got / tp.max : 0, lost = tp.max - tp.got;
    const rating = pct >= 0.8 ? 'strength' : (pct < 0.5 || lost >= 4) ? 'weak' : 'developing';
    return { ...tp, pct, lost, rating, limited: tp.n === 1 };
  });
  const order = Object.keys(TOPICS);
  rows.sort((a, b) => order.indexOf(a.topic) - order.indexOf(b.topic));
  const lostTotal = rows.reduce((s, r) => s + r.lost, 0);
  const weak = rows.filter(r => r.rating === 'weak' || (r.rating === 'developing' && r.lost >= 2)).sort((a, b) => b.lost - a.lost);
  const pacing = (blankMarks >= 6 || longestRun.length >= 3) ? { marks: blankMarks, run: longestRun.length >= 3 ? `Q${longestRun[0].id}–Q${longestRun[longestRun.length - 1].id}` : '' } : null;
  const relevant = t.kind === 'composition' ? ['composition'] : order.filter(k => k !== 'composition');
  const untested = relevant.filter(k => !by[k]);
  const focus = weak.slice(0, 2);
  return { rows, strengths: rows.filter(r => r.rating === 'strength'), weak, pacing, untested, focus, lostTotal, blankMarks, pendingMarks,
    got: rows.reduce((s, r) => s + r.got, 0), max: maxMarks(t) };
}
const tName = k => `${TOPICS[k].zh} ${TOPICS[k].en}`;
const qList = arr => arr.map(q => 'Q' + q.id).join(', ');
function whatWentWrong(q, r) {
  if (isHand(q)) {
    if (!r.transcript) return `Q${q.id}: not answered / not in the photos`;
    const fb = (r.feedback || '').trim();
    return `Q${q.id}: ${r.awarded}/${q.marks}${fb ? ' — ' + (fb.length > 170 ? fb.slice(0, 167) + '…' : fb) : ''}`;
  }
  if (!r.given) return `Q${q.id}: not answered`;
  return `Q${q.id}: chose ${r.given.replace(/^\(\d\)\s*/, '')}, answer is ${correctAnswerText(q).replace(/^\(\d\)\s*/, '')}`;
}
function reportSummary(rep, t, res) {
  if (t.kind === 'composition') {
    const r = res[t.questions[0].id] || {};
    if (r.pending) return 'The composition has not been marked yet.';
    return `This composition scored ${rep.got}/${rep.max}.` + (r.parts ? ` Content ${r.parts.content}/6, language ${r.parts.language}/6, organisation ${r.parts.organisation}/3.` : '');
  }
  let s = `On this paper the score is ${rep.got}/${rep.max}${rep.pendingMarks ? ` with ${rep.pendingMarks} marks of written answers still to be marked` : ''}.`;
  if (rep.pacing) s += ` The biggest issue is unfinished work: ${rep.blankMarks} of the ${rep.lostTotal} lost marks were on questions left blank${rep.pacing.run ? ` (${rep.pacing.run})` : ''}.`;
  else if (rep.weak[0]) {
    const top = rep.weak.filter(r => r.lost === rep.weak[0].lost);
    s += top.length === 1 ? ` Most marks were lost on ${TOPICS[top[0].topic].en.toLowerCase()} (${top[0].lost} marks).`
      : ` Marks were lost across ${top.length} areas, ${top[0].lost} marks each: ${top.map(r => TOPICS[r.topic].en.toLowerCase()).join('; ')}.`;
  }
  else if (rep.lostTotal === 0 && !rep.pendingMarks) s += ' Every mark was gained on this paper.';
  return s;
}
function renderTopicReport() {
  const box = $id('topic-report').querySelector('div');
  const rep = buildTopicReport(TEST, results);
  let h = `<p class="mb-3">${esc(reportSummary(rep, TEST, results))}</p>`;
  if (rep.strengths.length) h += `<div class="font-semibold text-green-700 mb-1">Strengths 强项</div><ul class="list-disc pl-5 mb-3">${rep.strengths.map(r => `<li>${esc(tName(r.topic))}: ${r.got}/${r.max} (${qList([...r.full, ...r.part])}${r.limited ? ' — 1 question only' : ''})</li>`).join('')}</ul>`;
  const weakRows = [];
  if (rep.pacing) weakRows.push(`<tr><td>Pacing — questions left blank</td><td>${rep.pacing.marks}</td><td>${esc(rep.pacing.run || qList(rep.rows.flatMap(r => r.blank)))}</td><td>Practise finishing the paper on time; move on after about 2 minutes and come back.</td></tr>`);
  rep.weak.forEach(r => weakRows.push(`<tr><td>${esc(tName(r.topic))}${r.limited ? ' <span class="text-xs text-slate-400">(1 question only)</span>' : ''}</td><td>${r.lost}</td><td>${qList([...r.part, ...r.wrong, ...r.blank])}</td><td>${[...r.part, ...r.wrong, ...r.blank].map(q => esc(whatWentWrong(q, results[q.id] || {}))).join('<br>')}</td></tr>`));
  if (weakRows.length) h += `<div class="font-semibold text-red-700 mb-1">Weak areas 弱项 (ranked by marks lost)</div><div class="overflow-x-auto mb-3"><table class="rep-table"><tr><th>Topic</th><th>Marks lost</th><th>Questions</th><th>What went wrong</th></tr>${weakRows.join('')}</table></div>`;
  const dev = rep.rows.filter(r => r.rating === 'developing' && !rep.weak.includes(r));
  if (dev.length) h += `<div class="font-semibold text-slate-700 mb-1">Developing</div><ul class="list-disc pl-5 mb-3">${dev.map(r => `<li>${esc(tName(r.topic))}: ${r.got}/${r.max}</li>`).join('')}</ul>`;
  if (rep.untested.length) h += `<div class="font-semibold text-slate-700 mb-1">Not tested by this paper</div><p class="mb-3">${rep.untested.map(k => esc(tName(k))).join('; ')}</p>`;
  if (rep.focus.length) h += `<div class="font-semibold text-slate-700 mb-1">Where to focus next</div><p>${esc(rep.focus.map(r => TOPICS[r.topic].en).join(' and '))} account for ${rep.focus.reduce((s, r) => s + r.lost, 0)} of the ${rep.lostTotal} lost marks.</p>`;
  box.innerHTML = h;
}

/* ===================== CHAT (华文小帮手) ===================== */
const TUTOR_PROMPT = `You are "华文小帮手" (Chinese Buddy), a friendly, patient Chinese Language tutor for a Primary 4 student (about 10 years old) in Singapore. The student has just finished a practice paper that has been marked and is asking about it.
How to help:
- Use the marked paper data sent with the student's message (question, passage, options, correct answer, explanation, the student's answer or what was read from their handwriting, marks, feedback). Don't invent details that aren't there.
- Explain in simple English, using Chinese words and short Chinese sentences where they help. Give hanyu pinyin in brackets for harder words, e.g. 焦急 (jiāojí). Keep it short (usually under 120 words). End with one small practice question when useful, e.g. make a sentence with the word.
- If the student thinks the marking is wrong, check carefully. If they are right, say so honestly and suggest they show a parent (a parent can change the mark). If the marking is right, explain kindly why.
- Be warm and encouraging; never make the student feel bad.
- Stay on Chinese and this paper; gently steer other topics back.
- Refer to questions as Q12 etc. Plain text only: no markdown headings or tables. You may use **bold** for a key word.`;
const isDesktop = () => window.matchMedia('(min-width:1024px)').matches;
function findQuestionRefs(text) {
  const ids = [], re = /(?:\b(?:q|question)\s*\.?\s*|第\s*)(\d{1,2})(?:\s*题)?(?!\d)/gi;
  let m;
  while ((m = re.exec(text))) { const n = m[1]; if (qById(n) && !ids.includes(n)) ids.push(n); }
  if (!ids.length && TEST?.kind === 'composition' && /作文|composition|essay/i.test(text)) ids.push(QUESTIONS[0].id);
  return ids;
}
function qContext(id) {
  const q = qById(id), r = results[id] || {}, sec = sectionOf(q.sec);
  const L = [`${qLabel(q)} (${q.marks} marks, ${TOPICS[q.topic]?.zh})`, `Question: ${plain(q.q)}`];
  if (sec.passage) L.push(`Passage: ${plain(sec.passage).slice(0, 900)}`);
  if (q.type === 'mcq') L.push('Options: ' + q.opts.map((o, i) => `(${i + 1}) ${plain(o)}`).join('; '));
  if (q.type === 'bank') L.push('Word box: ' + sec.bank.map((w, i) => `${i + 1}.${w}`).join(' '));
  if (q.picture) L.push(`Pictures: ${q.picture}`);
  L.push(`Correct answer: ${correctAnswerText(q)}`);
  if (q.why) L.push(`Explanation: ${q.why}`);
  if (q.scheme) L.push(`Marking scheme: ${q.scheme}`);
  L.push(isHand(q) ? `Student's handwritten answer (as read by Gemini): ${r.transcript || '(not answered / not found)'}` : `Student's answer: ${r.given || '(not answered)'}`);
  L.push(`Marks awarded: ${r.pending ? 'not marked yet' : (r.awarded ?? 0) + '/' + q.marks}${r.adjusted ? ' (set by a parent)' : ''}`);
  if (r.feedback) L.push(`Marker's feedback: ${r.feedback}`);
  if (r.better) L.push(`Suggested answer: ${r.better}`);
  return L.join('\n');
}
function paperSummary() {
  const tot = QUESTIONS.reduce((s, q) => s + (results[q.id]?.awarded || 0), 0);
  const lost = QUESTIONS.filter(q => (results[q.id]?.awarded || 0) < q.marks).map(q => `Q${q.id} (${results[q.id]?.pending ? 'not marked' : (results[q.id]?.awarded || 0) + '/' + q.marks})`);
  return `Paper: ${TEST.schoolEn} ${TEST.school} P4 华文 ${TEST.paper}. Student${store.name ? ': ' + store.name : ''}. Score: ${tot}/${maxMarks(TEST)}. Questions with marks lost: ${lost.join(', ') || 'none'}.`;
}
function fmt(text) {
  let h = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  h = h.replace(/\bQ(\d{1,2})\b/g, (m, n) => qById(n) ? `<a href="#card-${n}" class="qlink" data-q="${n}">${m}</a>` : m);
  return h.replace(/\n/g, '<br>');
}
function addMsg(role, text, opts = {}) {
  const box = $id('chat-msgs'), wrap = document.createElement('div'), b = document.createElement('div');
  wrap.className = 'flex ' + (role === 'user' ? 'justify-end' : 'justify-start');
  b.className = 'max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ' + (role === 'user' ? 'bg-red-600 text-white rounded-br-sm' : opts.error ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm');
  b.innerHTML = opts.html ?? fmt(text);
  if (opts.retryText) {
    const btn = document.createElement('button'); btn.type = 'button';
    btn.className = 'mt-2 block text-xs font-semibold px-3 py-1 rounded-full bg-white border border-red-300 text-red-700 hover:bg-red-100';
    btn.textContent = '↻ Try again';
    btn.onclick = () => { if (chatBusy) return; wrap.remove(); sendChat(opts.retryText, { retry: true }); };
    b.appendChild(btn);
  }
  if (opts.model) { const m = document.createElement('div'); m.className = 'mt-1 text-[10px] text-slate-400'; m.textContent = opts.model; b.appendChild(m); }
  wrap.appendChild(b); box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
  return wrap;
}
function focusQuestion(id) {
  const card = $id('card-' + id); if (!card) return;
  // Bring the question card into view (results sit above the questions —
  // scrolling to y=0 only shows the results card, not the question).
  requestAnimationFrame(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 2700);
  });
}
function showChips(id) {
  const q = qById(id), full = (results[id]?.awarded ?? 0) === q.marks;
  const chips = q.type === 'essay' ? ['How can I make my story better?', 'Which words did I write wrongly?']
    : full ? ['Explain why this is right', 'Give me a sentence with this word'] : ['Why did I lose marks?', 'Explain it again simply'];
  const box = $id('chat-chips');
  box.innerHTML = `<span class="text-xs text-slate-500 mr-1">About ${qLabel(q)}:</span>` + chips.map(c => `<button type="button" class="chip">${c}</button>`).join('');
  box.querySelectorAll('.chip').forEach((b, i) => b.onclick = () => sendChat(`${q.type === 'essay' ? '作文' : 'Q' + id}: ${chips[i]}`));
}
function askAbout(id) {
  if (!marked) return;
  openChat(); activeQ = id;
  const q = qById(id), input = $id('chat-input'), pre = q.type === 'essay' ? '作文: ' : `Q${id}: `;
  input.value = pre + input.value.replace(/^(Q\d{1,2}|作文):\s*/i, '');
  showChips(id); input.focus(); input.setSelectionRange(input.value.length, input.value.length);
}
async function sendChat(textArg, opts = {}) {
  const input = $id('chat-input'), fromInput = textArg === undefined;
  const text = (fromInput ? input.value : textArg).trim();
  if (!text || chatBusy || !marked) return;
  if (!API_ON) { addMsg('assistant', '华文小帮手 needs a Gemini API key (js/config.js).', { error: true }); return; }
  if (/^(Q\d{1,2}|作文):\s*$/i.test(text)) { input.focus(); return; }
  if (fromInput) input.value = '';
  const t = TEST, log = chatLog, hist = chatHistory, here = () => TEST === t;
  let ids = findQuestionRefs(text);
  if (!ids.length && activeQ) ids = [activeQ];
  if (ids.length) { activeQ = ids[0]; showChips(activeQ); }
  if (!opts.retry) { addMsg('user', text); log.push({ role: 'Student', text, time: Date.now(), about: ids.map(i => qLabel(qById(i))).join(', ') }); saveStore(); }
  const ctx = ids.map(qContext).join('\n\n');
  hist.push({ role: 'user', parts: [{ text: (ctx ? `[Marked paper data]\n${ctx}\n[/Marked paper data]\n\n` : '') + 'Student: ' + text }] });
  chatBusy = true; $id('chat-send').disabled = true;
  const typing = addMsg('assistant', '', { html: '<span class="dots"><span></span><span></span><span></span></span><span class="typing-status text-xs text-slate-500 ml-2"></span>' });
  const setStatus = s => { const el = typing.querySelector('.typing-status'); if (el) el.textContent = s; };
  try {
    const { text: reply, model } = await callGemini({
      systemInstruction: { parts: [{ text: TUTOR_PROMPT + '\n\nPaper summary: ' + paperSummary() }] },
      contents: hist.slice(-15), generationConfig: { temperature: 0.4 }
    }, { attemptTimeoutMs: 30000, budgetMs: 90000, onStatus: setStatus });
    typing.remove();
    hist.push({ role: 'model', parts: [{ text: reply }] });
    log.push({ role: '华文小帮手', text: reply, time: Date.now(), model });
    saveStore();
    if (here()) { addMsg('assistant', reply, { model }); if (ids.length) focusQuestion(ids[0]); }
  } catch (e) {
    typing.remove(); hist.pop();
    log.push({ role: 'Error', text: friendlyError(e), time: Date.now() }); saveStore();
    if (here()) addMsg('assistant', `Sorry, I couldn't answer just now. ${friendlyError(e)}`, { error: true, retryText: text });
  } finally { chatBusy = false; $id('chat-send').disabled = !marked; }
}
function setChatLocked(locked) {
  const i = $id('chat-input'); i.disabled = locked; $id('chat-send').disabled = locked;
  i.placeholder = locked ? 'Submit your paper first, then ask me about any question.' : 'e.g. "Q12: 为什么是悄悄？"';
}
function resetChat() { activeQ = null; $id('chat-msgs').innerHTML = ''; $id('chat-chips').innerHTML = ''; $id('chat-input').value = ''; setChatLocked(true); }
function restoreChat() {
  $id('chat-msgs').innerHTML = '';
  addMsg('assistant', "Welcome back! This paper has been marked. Press 💬 Ask next to any question and I'll help you understand it.");
  chatLog.forEach(m => {
    if (m.role === 'Student') addMsg('user', m.text);
    else if (m.role === 'Error') addMsg('assistant', `Sorry, I couldn't answer just now. ${m.text}`, { error: true });
    else addMsg('assistant', m.text, { model: m.model });
  });
}
function openChat() { $id('chat').classList.add('open'); }
function closeChat() { $id('chat').classList.remove('open'); }
$id('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(); } });
$id('chat-msgs').addEventListener('click', e => { const a = e.target.closest('a.qlink'); if (!a) return; e.preventDefault(); if (!isDesktop()) closeChat(); focusQuestion(a.dataset.q); });

/* ===================== PDF REPORTS (jsPDF + embedded Chinese font) ===================== */
let fontPromise = null;
function loadPdfFont() {
  return fontPromise ??= new Promise((resolve, reject) => {
    if (window.NOTO_SC_TTF) return resolve(window.NOTO_SC_TTF);
    const s = document.createElement('script'); s.src = 'fonts/noto-sans-sc-p4.js';
    s.onload = () => window.NOTO_SC_TTF ? resolve(window.NOTO_SC_TTF) : reject(new Error('font missing'));
    s.onerror = () => { fontPromise = null; reject(new Error('font failed to load')); };
    document.head.appendChild(s);
  });
}
const fmtDate = d => new Date(d).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fileStem = kind => { const name = (store.name || 'student').trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'student'; return `P4-Chinese-${kind}-${name}-${new Date().toLocaleDateString('en-CA')}.pdf`; };
const C = { ink: [30, 41, 59], grey: [100, 116, 139], red: [185, 28, 28], blue: [29, 78, 216], green: [21, 128, 61], amber: [180, 83, 9] };
const pdfText = s => String(s ?? '').replace(/\r/g, '').replace(/[✓✔]/g, '√').replace(/[✗✘]/g, '×').replace(/[⏳💡📷✍🎉💬🔒⬇↻⚠]/gu, '').replace(/\*\*(.+?)\*\*/g, '$1');
async function pdfWriter(footer) {
  if (!window.jspdf?.jsPDF) { alert('The PDF tool could not load. Please check your internet connection and reload the page.'); return null; }
  let font;
  try { font = await loadPdfFont(); } catch (_) { alert('The Chinese font for the PDF could not load. Please check your connection and try again.'); return null; }
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('NotoSC.ttf', font); doc.addFont('NotoSC.ttf', 'NotoSC', 'normal'); doc.setFont('NotoSC', 'normal');
  const PW = 210, PH = 297, Mg = 16, CW = PW - 2 * Mg; let y = Mg;
  const w = {
    doc, fit(h) { if (y + h > PH - Mg - 6) { doc.addPage(); y = Mg; } },
    text(s, o = {}) {
      const size = o.size || 10, indent = o.indent || 0, lh = size * 0.3528 * (o.lh || 1.45);
      doc.setFontSize(size); doc.setTextColor(...(o.color || C.ink));
      const lines = String(pdfText(s)).split('\n').flatMap(par => doc.splitTextToSize(par || ' ', CW - indent));
      for (const line of lines) { w.fit(lh); y += lh; doc.text(line, Mg + indent, y - lh * 0.28); }
      y += o.after ?? 1.2;
    },
    field(label, value, o = {}) { w.fit(11); w.text(label, { size: 8, color: o.labelColor || C.grey, after: 0.2 }); w.text(value, { size: 9.5, indent: 3, color: o.color, after: 1.6 }); },
    rule() { w.fit(5); y += 1.5; doc.setDrawColor(203, 213, 225); doc.line(Mg, y, PW - Mg, y); y += 3; },
    space(h) { y += h; },
    newPage() { doc.addPage(); y = Mg; },
    table(cols, rows) {          // cols: [{h, w}] widths in mm
      const pad = 1.5, size = 8.5, lh = size * 0.3528 * 1.4;
      const draw = (cells, head) => {
        doc.setFontSize(size);
        const wrapped = cells.map((c, i) => doc.splitTextToSize(pdfText(c), cols[i].w - 2 * pad));
        const hgt = Math.max(...wrapped.map(l => l.length)) * lh + 2 * pad;
        w.fit(hgt);
        let x = Mg;
        if (head) { doc.setFillColor(241, 245, 249); doc.rect(Mg, y, cols.reduce((s, c) => s + c.w, 0), hgt, 'F'); }
        wrapped.forEach((l, i) => { doc.setTextColor(...(head ? C.grey : C.ink)); l.forEach((ln, k) => doc.text(ln, x + pad, y + pad + (k + 1) * lh - lh * 0.28)); doc.setDrawColor(203, 213, 225); doc.rect(x, y, cols[i].w, hgt); x += cols[i].w; });
        y += hgt;
      };
      draw(cols.map(c => c.h), true); rows.forEach(r => draw(r, false)); y += 2;
    },
    image(dataUrl, iw, ih, caption) {
      const maxW = CW, maxH = PH - 2 * Mg - 16, s = Math.min(maxW / iw, maxH / ih), wmm = iw * s, hmm = ih * s;
      w.fit(hmm + 8); if (caption) w.text(caption, { size: 9, color: C.grey, after: 1 });
      w.fit(hmm); doc.addImage(dataUrl, 'JPEG', Mg + (CW - wmm) / 2, y, wmm, hmm); y += hmm + 4;
    },
    save(name) {
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(148, 163, 184); doc.text(pdfText(footer), Mg, PH - 8); doc.text(`Page ${i} of ${n}`, PW - Mg, PH - 8, { align: 'right' }); }
      doc.save(name);
    }
  };
  return w;
}
function pdfHeader(w, heading) {
  w.text(heading, { size: 18, color: C.red, after: 0.5 });
  w.text(`${TEST.school} ${TEST.schoolEn} - 小四华文 P4 Chinese ${TEST.exam} ${TEST.paper}`, { size: 10, color: C.grey, after: 3 });
  w.text(`Student: ${store.name || '(no name entered)'}`, { size: 10.5, after: 0.5 });
  if (submittedAt) w.text(`Marked: ${fmtDate(submittedAt)}`, { size: 9, color: C.grey, after: 0.5 });
  w.text(`Downloaded: ${fmtDate(Date.now())}`, { size: 9, color: C.grey, after: 2 });
  const got = {}, max = {};
  TEST.sections.forEach(s => { got[s.id] = 0; max[s.id] = 0; });
  QUESTIONS.forEach(q => { max[q.sec] += q.marks; got[q.sec] += results[q.id]?.awarded || 0; });
  const pend = QUESTIONS.filter(q => results[q.id]?.pending).reduce((s, q) => s + q.marks, 0);
  w.text(`Score: ${Object.values(got).reduce((a, b) => a + b, 0)} / ${maxMarks(TEST)}${pend ? `  (${pend} marks of written answers not marked yet)` : ''}`, { size: 14, after: 0.5 });
  if (TEST.sections.length > 1) w.text(TEST.sections.map(s => `${secLabel(s)} ${got[s.id]}/${max[s.id]}`).join('    '), { size: 9.5, after: 1 });
}
function pdfReport(w) {
  const rep = buildTopicReport(TEST, results);
  w.newPage();
  w.text(`Strengths and Weak Areas: ${store.name || 'student'}`, { size: 15, color: C.red, after: 1 });
  w.text(`${TEST.schoolEn} ${TEST.paper} · topics follow the MOE Primary Chinese Language syllabus (2024)`, { size: 9, color: C.grey, after: 3 });
  w.text('Summary', { size: 12, color: C.blue, after: 0.5 }); w.text(reportSummary(rep, TEST, results), { size: 10, after: 3 });
  w.text('Strengths 强项', { size: 12, color: C.green, after: 0.5 });
  if (rep.strengths.length) rep.strengths.forEach(r => w.text(`•  ${tName(r.topic)}: ${r.got}/${r.max} (${qList([...r.full, ...r.part])}${r.limited ? ' - 1 question only' : ''})`, { size: 9.5, after: 0.8 }));
  else w.text('No topic reached 80% on this paper.', { size: 9.5, color: C.grey });
  w.space(2);
  w.text('Weak areas 弱项 (ranked by marks lost)', { size: 12, color: C.red, after: 1 });
  const rows = [];
  if (rep.pacing) rows.push(['Pacing — questions left blank', String(rep.pacing.marks), rep.pacing.run || qList(rep.rows.flatMap(r => r.blank)), 'Practise finishing the paper on time; move on after about 2 minutes and come back.']);
  rep.weak.forEach(r => rows.push([tName(r.topic) + (r.limited ? ' (1 question only)' : ''), String(r.lost), qList([...r.part, ...r.wrong, ...r.blank]), [...r.part, ...r.wrong, ...r.blank].map(q => whatWentWrong(q, results[q.id] || {})).join('\n')]));
  if (rows.length) w.table([{ h: 'Topic', w: 46 }, { h: 'Lost', w: 12 }, { h: 'Questions', w: 24 }, { h: 'What went wrong', w: 96 }], rows);
  else w.text('No weak areas on this paper.', { size: 9.5, color: C.grey });
  const dev = rep.rows.filter(r => r.rating === 'developing' && !rep.weak.includes(r));
  if (dev.length) { w.text('Developing', { size: 11, after: 0.5 }); dev.forEach(r => w.text(`•  ${tName(r.topic)}: ${r.got}/${r.max}`, { size: 9.5, after: 0.6 })); w.space(1); }
  if (rep.untested.length) { w.text('Not tested by this paper', { size: 11, after: 0.5 }); w.text(rep.untested.map(tName).join('; '), { size: 9.5, after: 2 }); }
  if (rep.focus.length) { w.text('Where to focus next', { size: 11, after: 0.5 }); w.text(`${rep.focus.map(r => TOPICS[r.topic].en).join(' and ')} account for ${rep.focus.reduce((s, r) => s + r.lost, 0)} of the ${rep.lostTotal} lost marks on this paper.`, { size: 9.5, after: 2 }); }
}
async function downloadMarkedPdf() {
  if (!marked) return;
  const w = await pdfWriter(`${TEST.short} P4 华文 - marked paper`); if (!w) return;
  pdfHeader(w, 'Marked Paper 批改卷');
  w.text(`Marking: ${$id('marking-status').textContent}`, { size: 8.5, color: C.grey, after: 2 });
  if (aiOverall) { w.text('Overall feedback', { size: 11, after: 0.5 }); w.text(aiOverall, { size: 10, after: 2 }); }
  for (const sec of TEST.sections) {
    w.fit(30); w.space(3);
    w.text(`${sec.title}（${sec.marks}分）`, { size: 13, color: C.red, after: 0 }); w.rule();
    if (sec.passage) { w.text(plain(sec.passage), { size: 9, color: C.grey, after: 2 }); }
    if (sec.bank) w.text('词语：' + sec.bank.map((x, i) => `${i + 1}. ${x}`).join('   '), { size: 9.5, after: 2 });
    for (const q of QUESTIONS.filter(x => x.sec === sec.id)) {
      const r = results[q.id] || { awarded: 0 };
      const full = r.awarded === q.marks, none = r.awarded === 0;
      const verdict = r.pending ? 'not marked yet' : full ? 'correct' : none ? ((isHand(q) ? r.transcript : r.given) ? 'wrong' : 'not answered') : 'partly correct';
      w.fit(28);
      w.text(`${qLabel(q)}    ${r.pending ? '?' : r.awarded} / ${q.marks}  (${verdict})${r.adjusted ? '  - mark set by a parent' : ''}`, { size: 11, color: r.pending ? C.grey : full ? C.green : none ? C.red : C.amber, after: 0.8 });
      w.text(plain(q.q), { size: 10, after: 0.8 });
      if (q.type === 'mcq') w.text(q.opts.map((o, i) => `(${i + 1}) ${plain(o)}`).join('    '), { size: 9.5, color: C.grey, after: 1.5 });
      if (isHand(q)) {
        w.field("Child's handwritten answer (as read by Gemini)", r.pending ? '(not marked yet)' : (r.transcript || '(not answered / not found in the photos)'), { color: full ? C.green : C.ink });
        if (r.parts) w.field('Breakdown', `内容 Content ${r.parts.content}/6 · 语文 Language ${r.parts.language}/6 · 组织 Organisation ${r.parts.organisation}/3`);
        if (r.feedback) w.field('Gemini feedback', r.feedback, { labelColor: C.blue });
        if (r.better && !full) w.field(q.type === 'essay' ? 'Better sentences' : 'A full-marks answer', r.better, { labelColor: C.blue });
        w.field(q.type === 'essay' ? 'What a good composition needs' : 'Answer key', q.key);
        w.field('Marking scheme', q.scheme);
      } else {
        w.field("Child's answer", r.given || '(not answered)', { color: full ? C.green : C.ink });
        w.field('Correct answer', correctAnswerText(q));
        if (q.why) w.field('Explanation', q.why);
      }
      w.rule();
    }
  }
  if (TEST.notes?.length) { w.fit(20); w.text('Notes about this paper', { size: 12, color: C.red, after: 1 }); TEST.notes.forEach(n => w.text('- ' + n, { size: 9, after: 1 })); }
  pdfReport(w);
  if (photos.length) {
    w.newPage();
    w.text('Photos of the handwritten answers', { size: 13, color: C.red, after: 2 });
    photos.forEach((p, i) => w.image(p.dataUrl, p.w, p.h, `Photo ${i + 1} of ${photos.length}`));
  }
  w.save(fileStem(`${TEST.id}-Marked`));
}
async function downloadChatPdf() {
  if (!marked) return;
  const w = await pdfWriter(`${TEST.short} P4 华文 - 华文小帮手 chat log`); if (!w) return;
  pdfHeader(w, '华文小帮手 Chat Log');
  const asked = chatLog.filter(m => m.role === 'Student').length;
  w.text(`${asked} message${asked === 1 ? '' : 's'} from the student.`, { size: 10, color: C.grey, after: 0 }); w.rule();
  if (!chatLog.length) w.text('The student did not ask 华文小帮手 anything.', { color: C.grey });
  for (const m of chatLog) {
    const t = new Date(m.time).toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const head = m.role === 'Student' ? `Student - ${t}${m.about ? '  (about ' + m.about + ')' : ''}` : m.role === 'Error' ? `Connection problem - ${t}` : `华文小帮手 - ${t}${m.model ? '  [' + m.model + ']' : ''}`;
    w.fit(14);
    w.text(head, { size: 9, color: m.role === 'Student' ? C.red : m.role === 'Error' ? C.amber : C.grey, after: 0.5 });
    w.text(m.text, { size: 10, indent: 3, after: 3.5 });
  }
  w.save(fileStem(`${TEST.id}-Chat`));
}
async function downloadProgressPdf() {
  const w = await pdfWriter('P4 华文 practice papers - progress report'); if (!w) return;
  w.text('Progress Report 进度报告', { size: 18, color: C.red, after: 0.5 });
  w.text('P4 华文 practice papers (2025 年终考试)', { size: 10, color: C.grey, after: 3 });
  w.text(`Student: ${store.name || '(no name entered)'}`, { size: 10.5, after: 0.5 });
  w.text(`Downloaded: ${fmtDate(Date.now())}`, { size: 9, color: C.grey, after: 2 }); w.rule();
  TESTS.forEach(t => {
    const a = store.attempts[t.id], max = maxMarks(t);
    w.fit(16);
    w.text(`${t.school} ${t.schoolEn} · ${t.paper}`, { size: 11, after: 0.3 });
    if (a?.status === 'marked') {
      const sc = scoreOf(a), pend = pendingOf(t, a);
      w.text(`Score: ${sc} / ${max} (${Math.round(sc / max * 100)}%) - marked ${fmtDate(a.submittedAt)}${pend ? ' - written answers not marked yet' : ''}`, { size: 10, color: C.green, after: 0.3 });
      const lost = t.questions.filter(q => !a.results?.[q.id]?.pending && (a.results?.[q.id]?.awarded || 0) < q.marks).map(q => 'Q' + q.id);
      if (lost.length && t.kind !== 'composition') w.text(`Marks lost on: ${lost.join(', ')}`, { size: 9, color: C.grey, after: 0.3 });
      const rep = buildTopicReport(t, a.results || {});
      if (rep.weak.length) w.text(`Weakest topics: ${rep.weak.slice(0, 2).map(r => `${TOPICS[r.topic].zh} ${TOPICS[r.topic].en} (-${r.lost})`).join('; ')}${rep.pacing ? '; pacing (' + rep.pacing.marks + ' marks left blank)' : ''}`, { size: 9, color: C.grey, after: 0.3 });
      const asked = (a.chatLog || []).filter(m => m.role === 'Student').length;
      if (asked) w.text(`Asked 华文小帮手 ${asked} question${asked > 1 ? 's' : ''}.`, { size: 9, color: C.grey, after: 0.3 });
    } else if (a?.status === 'in-progress') w.text(`In progress - ${answeredCount(t, a)} options questions answered, ${a.photoCount || 0} photos`, { size: 10, color: C.amber, after: 0.3 });
    else w.text('Not started', { size: 10, color: C.grey, after: 0.3 });
    (a?.history || []).forEach(h => w.text(`Earlier attempt: ${h.score}/${h.max} (${fmtDate(h.at)})`, { size: 9, color: C.grey, after: 0.3 }));
    w.rule();
  });
  w.save(fileStem('Progress'));
}

/* ===================== START ===================== */
window.addEventListener('beforeunload', () => { if (TEST && !marked) saveAnswers(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && TEST && !marked) saveAnswers(); });
(function start() {
  const m = location.hash.match(/paper=([\w-]+)/);
  if (m && TESTS.some(t => t.id === m[1])) openTest(m[1]); else renderLanding();
})();
