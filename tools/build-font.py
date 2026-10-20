"""Rebuilds fonts/noto-sans-sc-p4.js (the Chinese font used in the PDFs).
Run after adding a paper with rare characters:  pip install fonttools  then  python3 tools/build-font.py
Needs Noto Sans CJK installed (e.g. apt install fonts-noto-cjk); change the path below if it is elsewhere."""
import sys, glob, re, os
from fontTools.ttLib import TTCollection, TTFont, newTable
from fontTools.subset import Subsetter, Options
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

ttc = TTCollection('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
font = next(f for f in ttc.fonts if 'SC' in f['name'].getDebugName(1))
print('using', font['name'].getDebugName(4))

chars = set(chr(c) for c in range(0x20, 0x7f))
chars |= set('，。、；：？！“”‘’（）《》〈〉【】—…·～￥％＋－×÷＝＜＞０１２３４５６７８９　℃°√✓✗•●○■□▲△→←↑↓①②③④⑤⑥⑦⑧⑨⑩「」『』')
for hi in range(0xB0, 0xD8):                     # GB2312 level-1: the 3,755 most common characters
    for lo in range(0xA1, 0xFF):
        try: chars.add(bytes([hi, lo]).decode('gb2312'))
        except Exception: pass
for f in glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'papers', '*.js')):
    chars |= set(open(f, encoding='utf-8').read())
chars = {c for c in chars if ord(c) >= 0x20}
print('chars', len(chars))

opts = Options(); opts.layout_features = []; opts.name_IDs = ['*']; opts.hinting = False; opts.notdef_outline = True
sub = Subsetter(opts); sub.populate(unicodes=[ord(c) for c in chars]); sub.subset(font)

# CFF (cubic) -> glyf (quadratic) so jsPDF can embed it
gs = font.getGlyphSet(); order = font.getGlyphOrder(); glyf = {}
for name in order:
    pen = TTGlyphPen(gs); gs[name].draw(Cu2QuPen(pen, 1.0, reverse_direction=True)); glyf[name] = pen.glyph()
font['loca'] = newTable('loca'); font['glyf'] = g = newTable('glyf'); g.glyphOrder = order; g.glyphs = glyf
del font['CFF ']
if 'VORG' in font: del font['VORG']
font['maxp'] = m = newTable('maxp'); m.tableVersion = 0x00010000
for k in ['maxZones','maxTwilightPoints','maxStorage','maxFunctionDefs','maxInstructionDefs','maxStackElements','maxSizeOfInstructions','maxComponentElements']:
    setattr(m, k, 0)
m.maxZones = 1; m.numGlyphs = len(order)
font['head'].indexToLocFormat = 1; font['head'].glyphDataFormat = 0
font['post'].formatType = 3.0
font.sfntVersion = '\x00\x01\x00\x00'
import base64, io, os
buf = io.BytesIO(); font.save(buf)
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
with open(os.path.join(root, 'fonts', 'noto-sans-sc-p4.js'), 'w') as f:
    f.write('/* Noto Sans SC (SIL Open Font License 1.1), subset to the 3,755 most common characters + the paper text, converted to TrueType for jsPDF. Built by tools/build-font.py */\n')
    f.write('window.NOTO_SC_TTF = "' + base64.b64encode(buf.getvalue()).decode() + '";\n')
print('wrote fonts/noto-sans-sc-p4.js', len(buf.getvalue()), 'bytes')
