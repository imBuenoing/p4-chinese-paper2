/* =====================================================================
   Shared helpers used by the paper files in /papers.
   Loaded before the papers and before app.js.
   ===================================================================== */

/* registry the paper files add themselves to */
const TESTS = [];

/* a blank to fill in, e.g. 宝宝一${B}开眼睛 */
const B = '<span class="blank"></span>';
/* a numbered blank inside a passage, e.g. ${QB(7)} */
const QB = n => `<span class="qblank" data-q="${n}">Q${n}</span>`;
/* a character with pinyin above it, e.g. ${R('贩', 'fàn')} */
const R = (han, py) => `<ruby>${han}<rt>${py}</rt></ruby>`;
/* paragraphs of a passage: P('段一', '段二') */
const P = (...paras) => paras.map(p => `<p>${p}</p>`).join('');

/* Question types
   mcq    – 4 options shown on the paper (radio buttons, auto-marked)
   bank   – pick a number from the section's word box (词语搭配, auto-marked)
   write  – no options on the paper: written by hand on paper, photographed, marked by Gemini
   essay  – composition: written by hand on paper, photographed, marked by Gemini
*/

/* Topics for the strengths and weak-areas report. They follow the reading and
   writing objectives of the MOE Primary Chinese Language syllabus (2024). */
const TOPICS = {
  zi:        { zh: '辨字',               en: 'Telling similar characters apart', group: '语文应用 Language use' },
  ci:        { zh: '词语选择',           en: 'Choosing the right word (incl. idioms and connectives)', group: '语文应用 Language use' },
  dapei:     { zh: '词语搭配',           en: 'Word collocations', group: '语文应用 Language use' },
  cloze:     { zh: '短文填空',           en: 'Words in a passage (cloze)', group: '语文应用 Language use' },
  main:      { zh: '理解主要内容和目的', en: 'Main idea and purpose of a text', group: '阅读理解 Reading' },
  info:      { zh: '找出具体信息',       en: 'Finding specific information', group: '阅读理解 Reading' },
  wordctx:   { zh: '根据上下文推断词义', en: 'Working out word meaning from context', group: '阅读理解 Reading' },
  reason:    { zh: '理解原因和隐含信息', en: 'Explaining reasons and implied information', group: '阅读理解 Reading' },
  character: { zh: '人物心情、性格与看法', en: "Characters' feelings, traits and giving views", group: '阅读理解 Reading' },
  note:      { zh: '书面互动（便条／短信）', en: 'Functional writing (notes and messages)', group: '写作 Writing' },
  composition: { zh: '看图作文',         en: 'Picture composition', group: '写作 Writing' }
};
