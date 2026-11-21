# -*- coding: utf-8 -*-
"""
HARMONIX-AR — Software Engineering Capstone deck (v2).
UI evidence : real headless-browser screenshots of the implemented app (ppt-work/shots).
Theme       : the app's CURRENT light engineering palette (tailwind.config.ts / globals.css).
Slide 1     : faithful replica of the reference capstone deck title slide (exact logo).
"""
import os
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.oxml.ns import qn

ROOT = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(ROOT, "shots")
REF = os.path.join(ROOT, "ref")
LOGO = os.path.join(ROOT, "logo")
IMG = os.path.join(ROOT, "..", "image-search")

# ---- current app light-theme tokens (tailwind hud.light-*) ----
BG       = "F8FAFC"
CARD     = "FFFFFF"
SURF     = "F1F5F9"
BORDER   = "E2E8F0"
BORDERHI = "CBD5E1"
NAVY     = "0F172A"
ACC      = "0284C7"   # sky-600
ACC_DK   = "0369A1"   # sky-700
ACC_BG   = "F0F9FF"   # sky-50
MUTED    = "64748B"
BODYTX   = "334155"
SAFE     = "16A34A"
SAFE_BG  = "F0FDF4"
DANGER   = "DC2626"
DANGER_BG= "FEF2F2"
WARN     = "B45309"
WARN_BG  = "FFFBEB"
VOLT     = "68A800"
REFBLUE  = "1F6FB2"   # reference deck title blue

FONT = "Inter"        # app typeface (next/font Inter); graceful fallback elsewhere
SERIF = "Times New Roman"

SW, SH = 13.333, 7.5
EMU_IN = 914400

prs = Presentation()
prs.slide_width = Inches(SW)
prs.slide_height = Inches(SH)
BLANK = prs.slide_layouts[6]

def C(h): return RGBColor.from_string(h)

# ---- AR grid backdrop (app's .ar-grid-bg, light variant) ----
GRID_PNG = os.path.join(ROOT, "grid_light.png")
if not os.path.exists(GRID_PNG):
    im = Image.new("RGB", (1280, 720), "#F8FAFC")
    d = ImageDraw.Draw(im)
    for x in range(0, 1280, 24):
        d.line([(x, 0), (x, 720)], fill=(226, 232, 240), width=1)
    for y in range(0, 720, 24):
        d.line([(0, y), (1280, y)], fill=(226, 232, 240), width=1)
    im.save(GRID_PNG)

def slide(grid=True):
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = C(BG)
    if grid:
        s.shapes.add_picture(GRID_PNG, 0, 0, Inches(SW), Inches(SH))
    return s

def set_spc(run, val):
    run._r.get_or_add_rPr().set('spc', str(val))

def _no_shadow(shp): shp.shadow.inherit = False

def rect(s, x, y, w, h, fill=None, line=None, lw=1.0, shape=MSO_SHAPE.RECTANGLE, dash=None):
    sp = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None: sp.fill.background()
    else: sp.fill.solid(); sp.fill.fore_color.rgb = C(fill)
    if line is None: sp.line.fill.background()
    else:
        sp.line.color.rgb = C(line); sp.line.width = Pt(lw)
        if dash:
            ln = sp.line._get_or_add_ln()
            ln.append(ln.makeelement(qn('a:prstDash'), {'val': dash}))
    _no_shadow(sp); sp.text_frame.word_wrap = True
    return sp

def chamfer(s, x, y, w, h, cut=0.14, fill=CARD, line=BORDER, lw=1.0, dash=None):
    X, Y, W, H, K = [v * EMU_IN for v in (x, y, w, h, cut)]
    pts = [(X + K, Y), (X + W, Y), (X + W, Y + H - K), (X + W - K, Y + H), (X, Y + H), (X, Y + K)]
    fb = s.shapes.build_freeform(int(pts[0][0]), int(pts[0][1]), scale=1)
    fb.add_line_segments([(int(px), int(py)) for px, py in pts[1:]], close=True)
    sp = fb.convert_to_shape()
    if fill is None: sp.fill.background()
    else: sp.fill.solid(); sp.fill.fore_color.rgb = C(fill)
    if line is None: sp.line.fill.background()
    else:
        sp.line.color.rgb = C(line); sp.line.width = Pt(lw)
        if dash:
            ln = sp.line._get_or_add_ln()
            ln.append(ln.makeelement(qn('a:prstDash'), {'val': dash}))
    _no_shadow(sp); sp.text_frame.word_wrap = True
    return sp

def alpha(shape, pct):
    clr = shape.fill._xPr.find(qn('a:solidFill')).find(qn('a:srgbClr'))
    clr.append(clr.makeelement(qn('a:alpha'), {'val': str(int(pct * 1000))}))

def txt(s, x, y, w, h, paras, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, sp_after=4, lsp=1.0):
    box = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame; tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    for i, runs in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align; p.space_after = Pt(sp_after); p.line_spacing = lsp
        for t, o in runs:
            r = p.add_run(); r.text = t
            f = r.font
            f.size = Pt(o.get('size', 13)); f.bold = o.get('bold', False)
            f.italic = o.get('italic', False); f.name = o.get('font', FONT)
            f.color.rgb = C(o.get('color', BODYTX))
            if o.get('spc'): set_spc(r, o['spc'])
    return box

def K(t, **kw):  # kicker / HUD label run
    o = {'size': 10, 'color': ACC, 'bold': True, 'spc': 140}; o.update(kw); return (t, o)

def bullets(s, x, y, w, items, size=12.5, color=BODYTX, marker="▸ ", mcolor=ACC, gap=5, lsp=1.02):
    paras = []
    for it in items:
        if isinstance(it, tuple):
            head, rest = it
            paras.append([(marker, {'size': size, 'color': mcolor, 'bold': True}),
                          (head, {'size': size, 'color': NAVY, 'bold': True}),
                          (rest, {'size': size, 'color': color})])
        else:
            paras.append([(marker, {'size': size, 'color': mcolor, 'bold': True}),
                          (it, {'size': size, 'color': color})])
    return txt(s, x, y, w, 4.0, paras, sp_after=gap, lsp=lsp)

def chip(s, x, y, w, label, fill=ACC_BG, line="BAE6FD", tcolor=ACC_DK, size=12.5, h=0.34, spc=60):
    c = chamfer(s, x, y, w, h, cut=0.10, fill=fill, line=line, lw=1.0)
    tf = c.text_frame
    tf.margin_left = Inches(0.12); tf.margin_right = Inches(0.06)
    tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; r = p.add_run(); r.text = label
    r.font.size = Pt(size); r.font.bold = True; r.font.name = FONT
    r.font.color.rgb = C(tcolor); set_spc(r, spc)
    return c

def img_fit(s, path, x, y, w, h):
    iw, ih = Image.open(path).size
    ar = iw / ih
    if w / h > ar: nh = h; nw = h * ar
    else: nw = w; nh = w / ar
    return s.shapes.add_picture(path, Inches(x + (w - nw) / 2), Inches(y + (h - nh) / 2), Inches(nw), Inches(nh))

SHOT_AR = 440.0 / 956.0
def phone(s, name, x, y, h, caption=None):
    path = os.path.join(SHOTS, name + ".png")
    w = h * SHOT_AR
    fr = rect(s, x, y, w, h, fill=CARD, line=BORDERHI, lw=1.25, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    fr.adjustments[0] = 0.045
    pad = 0.045
    s.shapes.add_picture(path, Inches(x + pad), Inches(y + pad), Inches(w - 2 * pad), Inches(h - 2 * pad))
    if caption:
        txt(s, x - 0.3, y + h + 0.05, w + 0.6, 0.4,
            [[K(caption, size=8, color=MUTED, spc=40)]], align=PP_ALIGN.CENTER, sp_after=0)
    return w

def arrow(s, x1, y1, x2, y2, color=ACC, w=1.5, dash=None, head=True):
    cn = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    cn.line.color.rgb = C(color); cn.line.width = Pt(w)
    ln = cn.line._get_or_add_ln()
    if dash: ln.append(ln.makeelement(qn('a:prstDash'), {'val': dash}))
    if head: ln.append(ln.makeelement(qn('a:tailEnd'), {'type': 'triangle', 'w': 'med', 'len': 'med'}))
    _no_shadow(cn)
    return cn

SE_LOGO = os.path.join(REF, "xref_37.png")
SEAL    = os.path.join(REF, "xref_14.png")
BANNER  = os.path.join(REF, "xref_9.png")
HXLOGO  = os.path.join(LOGO, "harmonix_logo.png")

PAGEN = [0]
def header(s, kicker, title):
    PAGEN[0] += 1
    L = 0.26
    for (cx, cy, dx, dy) in [(0.18, 0.18, 1, 1), (SW - 0.18, 0.18, -1, 1), (0.18, SH - 0.18, 1, -1), (SW - 0.18, SH - 0.18, -1, -1)]:
        hy = cy if dy > 0 else cy - 0.02
        vx = cx if dx > 0 else cx - 0.02
        vy = cy if dy > 0 else cy - L
        rect(s, vx, vy, 0.02, L, fill=BORDERHI)
        rect(s, cx if dx > 0 else cx - L, hy, L, 0.02, fill=BORDERHI)
    s.shapes.add_picture(SE_LOGO, Inches(0.42), Inches(0.24), height=Inches(0.60))
    s.shapes.add_picture(SEAL, Inches(SW - 1.12), Inches(0.20), height=Inches(0.70))
    txt(s, 0.5, 1.02, 9.5, 0.3, [[K("// " + kicker, size=10.5, spc=160)]], sp_after=0)
    txt(s, 0.48, 1.26, 11.2, 0.62, [[(title, {'size': 27, 'bold': True, 'color': NAVY, 'spc': 20})]], sp_after=0)
    rect(s, 0.52, 1.86, 1.55, 0.05, fill=ACC)
    rect(s, 2.12, 1.86, 0.16, 0.05, fill=VOLT)
    s.shapes.add_picture(HXLOGO, Inches(0.5), Inches(SH - 0.50), height=Inches(0.28))
    txt(s, 0.88, SH - 0.46, 8.0, 0.3,
        [[("HARMONIX-AR", {'size': 8.5, 'color': MUTED, 'bold': True, 'spc': 80}),
          ("   //   SOFTWARE ENGINEERING CAPSTONE · 2026", {'size': 8.5, 'color': BORDERHI, 'spc': 60})]], sp_after=0)
    txt(s, SW - 1.3, SH - 0.46, 0.8, 0.3, [[(f"{PAGEN[0]:02d}", {'size': 9, 'color': ACC, 'bold': True, 'spc': 60})]], align=PP_ALIGN.RIGHT, sp_after=0)

def table(s, rows, x, y, w, colw, rowh=0.55, headh=0.34, fs=8.8):
    ts = s.shapes.add_table(len(rows), len(colw), Inches(x), Inches(y), Inches(w), Inches(headh + rowh * (len(rows) - 1)))
    t = ts.table
    t.first_row = False; t.horz_banding = False
    for i, cw in enumerate(colw): t.columns[i].width = Inches(cw)
    for ri, row in enumerate(rows):
        t.rows[ri].height = Inches(headh if ri == 0 else rowh)
        for ci, val in enumerate(row):
            cell = t.cell(ri, ci)
            cell.margin_left = Inches(0.08); cell.margin_right = Inches(0.06)
            cell.margin_top = Inches(0.02); cell.margin_bottom = Inches(0.02)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.fill.solid()
            cell.fill.fore_color.rgb = C(SURF if ri == 0 else (CARD if ri % 2 else BG))
            p = cell.text_frame.paragraphs[0]
            r = p.add_run(); r.text = val
            r.font.size = Pt(fs + 0.7 if ri == 0 else fs)
            r.font.bold = (ri == 0 or ci == 0)
            r.font.name = FONT
            r.font.color.rgb = C(NAVY if ri == 0 else (ACC_DK if ci == 0 else BODYTX))
    return t

# ================================================================ 1 · TITLE (reference replica)
s = slide(grid=False)
s.shapes.add_picture(BANNER, Inches(1.48), Inches(0.30), width=Inches(10.34))
txt(s, 1.0, 2.02, SW - 2.0, 0.5, [[("CAPSTONE PROJECT", {'size': 22, 'bold': True, 'color': "000000", 'font': SERIF, 'spc': 40})]], align=PP_ALIGN.CENTER, sp_after=0)
txt(s, 0.7, 2.62, SW - 1.4, 1.3,
    [[("HARMONIX-AR: BROWSER-NATIVE CHLADNI RESONANCE IMAGING &", {'size': 26, 'bold': True, 'color': REFBLUE, 'font': SERIF})],
     [("AI-ASSISTED NON-DESTRUCTIVE TESTING OF PLATE STRUCTURES", {'size': 26, 'bold': True, 'color': REFBLUE, 'font': SERIF})]],
    align=PP_ALIGN.CENTER, sp_after=2, lsp=1.1)
txt(s, 1.0, 4.18, SW - 2.0, 0.45, [[("SOFTWARE ENGINEERING CAPSTONE", {'size': 18, 'bold': True, 'color': "000000", 'font': SERIF})]], align=PP_ALIGN.CENTER, sp_after=0)
txt(s, 0.55, 5.05, 5.0, 0.9,
    [[("UNDER THE SUPERVISION OF:", {'size': 15, 'bold': True, 'color': "000000", 'font': SERIF})],
     [("        Dr.Surendran R", {'size': 15, 'bold': True, 'color': "000000", 'font': SERIF})]], sp_after=8)
txt(s, 9.55, 5.05, 3.4, 0.9,
    [[("PRESENTED BY:", {'size': 15, 'bold': True, 'color': "000000", 'font': SERIF})],
     [("NANDHEESA PRASAD K-192511181", {'size': 14, 'bold': True, 'color': "000000", 'font': SERIF})]], sp_after=8)
txt(s, 1.0, 6.85, SW - 2.0, 0.3, [[("CAPSTONE PROJECT", {'size': 10, 'color': MUTED, 'font': SERIF, 'spc': 120})]], align=PP_ALIGN.CENTER, sp_after=0)

# ================================================================ 2 · INTRODUCTION
s = slide(); header(s, "01 · INTRODUCTION", "INTRODUCTION")
chip(s, 0.5, 2.05, 1.55, "Background")
txt(s, 0.5, 2.48, 7.3, 1.0,
    [[("Chladni figures (1787) make the nodal lines of a vibrating plate visible. Those modal fingerprints encode ", {'size': 12.5, 'color': BODYTX}),
      ("geometry, material, boundary conditions and internal damage", {'size': 12.5, 'color': ACC_DK, 'bold': True}),
      (" — the physical basis of vibration-based non-destructive testing (NDT).", {'size': 12.5, 'color': BODYTX})]], lsp=1.05)
chip(s, 0.5, 3.42, 2.35, "Need for the System")
bullets(s, 0.5, 3.85, 7.3, [
    "Classical modal labs need sand, shakers, LDV / impedance analysers — costly & bench-bound.",
    "Manual tap-testing is subjective, slow and operator-dependent.",
    "Every smartphone already carries a camera, microphone and GPU — an unused NDT bench.",
], size=12)
chip(s, 0.5, 5.28, 2.35, "Proposed Technology")
bullets(s, 0.5, 5.71, 7.3, [
    "WebGPU compute-shader Chladni particle imaging (WGSL).",
    "Computer-vision quad detection + autocorrelation audio resonance lock.",
    "Kirchhoff–Love plate physics + DINOv2 / AST / PINN AI microservice.",
], size=12)
txt(s, 8.15, 2.02, 4.7, 0.3, [[K("EXISTING SOLUTION", size=10, color=WARN, spc=160)]], sp_after=0)
img_fit(s, os.path.join(IMG, "chladni-plate-vibration-resonance-sand-p-1.png"), 8.15, 2.32, 2.30, 1.72)
img_fit(s, os.path.join(IMG, "non-destructive-testing-ultrasonic-inspe-2.jpg"), 10.55, 2.32, 2.30, 1.72)
txt(s, 8.15, 4.08, 4.7, 0.4, [[("Sand-plate Chladni rig & handheld UT probe — slow, wired, expert-only.", {'size': 8.5, 'color': MUTED})]], sp_after=0)
a = chamfer(s, 9.05, 4.52, 2.9, 0.5, cut=0.12, fill=NAVY, line=None)
tf = a.text_frame; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
r = p.add_run(); r.text = "HARMONIX-AR  →  browser-only"
r.font.size = Pt(11); r.font.bold = True; r.font.color.rgb = C("FFFFFF"); r.font.name = FONT
txt(s, 8.15, 5.14, 4.7, 0.2, [[K("PROPOSED · LIVE AR VIEWPORT (REAL SCREEN)", size=8.5, spc=80)]], align=PP_ALIGN.CENTER, sp_after=0)
phone(s, "viewport", 9.62, 5.36, 1.62)

# ================================================================ 3 · OBJECTIVE
s = slide(); header(s, "02 · OBJECTIVE", "OBJECTIVE")
chip(s, 0.5, 2.1, 2.2, "Primary Objectives")
bullets(s, 0.5, 2.55, 7.4, [
    ("Build a browser-native AR Chladni imager ", "that renders live nodal fields of a plate workpiece on the GPU (WebGPU/WGSL)."),
    ("Automate an NDT-grade inspection loop ", "— optical geometry, acoustic resonance lock, modal imaging, stress & defect inference — in one guided flow."),
    ("Produce audit-ready evidence ", "— DXF vector nodal maps, PDF inspection reports and a row-level-secured cloud inspection log."),
], size=12.5, gap=8)
chip(s, 0.5, 4.55, 2.35, "Secondary Objectives")
bullets(s, 0.5, 5.0, 7.4, [
    "Zero-install field operation with graceful on-device fallback when the AI service is offline.",
    "Multi-material physics library (FR4, Al-6061, steel, acrylic) with real elastic constants.",
    "Interactive what-if analysis: virtual standoff pins & component placement safety check.",
    "Secure multi-user sessions (Google OAuth + Postgres RLS), voice guide and i18n locale screen.",
], size=12.5, gap=6)
phone(s, "modes", 9.55, 2.0, 4.75, "6. SHAPES — HARMONIC EIGENMODE GALLERY")
chamfer(s, 8.35, 2.6, 1.0, 3.0, cut=0.1, fill=SURF, line=BORDER)
txt(s, 8.42, 2.75, 0.9, 2.8, [[K("OBJ", size=9, spc=120)], [("01", {'size': 9, 'color': MUTED})], [K("OBJ", size=9, spc=120)], [("02", {'size': 9, 'color': MUTED})], [K("OBJ", size=9, spc=120)], [("03", {'size': 9, 'color': MUTED})]], sp_after=8)

# ================================================================ 4 · PROBLEM STATEMENT
s = slide(); header(s, "03 · PROBLEM STATEMENT", "PROBLEM STATEMENT")
chip(s, 0.5, 2.1, 2.3, "Existing Problems")
bullets(s, 0.5, 2.55, 7.2, [
    "Experimental modal analysis demands shakers, laser Doppler vibrometers or impedance heads — expensive, lab-only.",
    "Manual coin/tap testing is qualitative; two inspectors disagree.",
    "FEM modal solves are offline and compute-heavy — unusable at the shop floor.",
    "Published CV-for-Chladni research is batch/offline: photos → training → prediction, no interactive loop.",
    "No traceable digital record binds geometry + resonance evidence to a report.",
], size=12.5, gap=7)
chip(s, 0.5, 5.35, 2.3, "Problem Definition", fill=ACC_BG, line=ACC)
txt(s, 0.5, 5.78, 7.4, 1.2,
    [[("Design and implement a web-native system that captures workpiece geometry through the camera, locks resonance through the microphone, images modal nodal fields in real time on the GPU, infers stress & subsurface anomalies with physics + AI, and exports audit-grade reports — ", {'size': 12.5, 'color': BODYTX}),
      ("using only commodity hardware.", {'size': 12.5, 'color': ACC_DK, 'bold': True})]], lsp=1.08)
img_fit(s, os.path.join(IMG, "von-mises-stress-fea-finite-element-heat-1.jpg"), 8.2, 2.1, 4.6, 2.45)
txt(s, 8.2, 4.58, 4.6, 0.35, [[K("OFFLINE FEA — ACCURATE BUT BENCH-BOUND & SLOW", size=8.5, color=MUTED, spc=40)]], align=PP_ALIGN.CENTER, sp_after=0)
chamfer(s, 8.2, 5.05, 4.6, 1.6, cut=0.14, fill=DANGER_BG, line=DANGER, lw=1.2)
txt(s, 8.45, 5.22, 4.1, 1.3,
    [[K("GAP", size=10, color=DANGER, spc=200)],
     [("No prior system closes the loop: ", {'size': 11.5, 'color': BODYTX}),
      ("sense → image → infer → report", {'size': 11.5, 'color': DANGER, 'bold': True}),
      (" in real time, in a browser, with zero instrumentation.", {'size': 11.5, 'color': BODYTX})]], sp_after=4)

# ================================================================ 5 · LITERATURE REVIEW
s = slide(); header(s, "04 · LITERATURE SURVEY", "LITERATURE REVIEW")
rows = [
    ("#", "STUDY (YEAR)", "APPROACH", "FINDING / LIMITATION vs HARMONIX-AR"),
    ("1", "Kumar & Wani — Open J. Acoustics 12(1), 2024", "Grayscale + Canny images of sand Chladni patterns → supervised ML modal-frequency prediction", "80–97 % class accuracy, but batch photos, sand + shaker lab required; no live imaging."),
    ("2", "Wani, Khedkar & Jatti — Springer ADCIS, 2024", "VGG16 / GoogleNet transfer learning on circular-plate Chladni photos", "99.2–99.5 % validation; classification only — no stress, defect or geometry quantification."),
    ("3", "Appl. Sci. 16(18):9246, 2026", "NN correlation of experimental Chladni images with FEM eigenfunctions (~1 % shift)", "Ties experiment to FEM, yet offline & compute-heavy; needs lab capture rig."),
    ("4", "Aerosp. Sci. Technol. (2025)", "Resonance-aware frequency-domain PINN–GPR surrogate for blade FRF under uncertainty", "State-of-art surrogate, but domain-specific offline training — not interactive what-if."),
    ("5", "Mech. Syst. Signal Process. (2026)", "Physics-informed DeepONet: structural intensity from noisy laser-Doppler vibrometry of plates", "Noise-robust gradients, but requires LDV hardware — exactly what we eliminate."),
    ("6", "Materials 19(1):205, 2026", "ANN surrogate replacing FE eigen-solves for variable-thickness plate frequencies", "Orders-of-magnitude faster than FEM; accuracy degrades with free-edge boundary cases."),
    ("7", "arXiv:2507.12563, 2025", "Benchmark of neural surrogates for nonlinear elastic-plate physical-modelling synthesis", "Confirms neural plate surrogates viable in real time; target is audio synthesis, not inspection."),
]
table(s, rows, 0.5, 1.98, 12.35, [0.42, 3.15, 4.35, 4.43], rowh=0.60, headh=0.32, fs=8.6)
txt(s, 0.5, 6.60, 12.3, 0.5,
    [[K("SYNTHESIS ▸ ", size=10.5, spc=80),
      ("Every prior thread is offline, instrument-bound or single-modality. HARMONIX-AR fuses optics + acoustics + physics + AI into one real-time, instrument-free, browser-native inspection loop with audit export.", {'size': 10.5, 'color': BODYTX})]], sp_after=0)

# ================================================================ 6 · PROPOSED SYSTEM
s = slide(); header(s, "05 · PROPOSED SYSTEM", "PROPOSED SYSTEM")
txt(s, 0.5, 2.05, 7.5, 1.5,
    [[("HARMONIX-AR turns a browser tab into an NDT bench. The camera frames the workpiece and four draggable pins solve its true millimetre geometry; the microphone listens to the excitation and an autocorrelation pitch-detector locks resonance; a WebGPU compute shader animates ", {'size': 12, 'color': BODYTX}),
      ("32,768 particles", {'size': 12, 'color': ACC_DK, 'bold': True}),
      (" into the live Chladni nodal field of the selected (m, n) mode; a FastAPI + PyTorch microservice adds DINOv2 segmentation, AST acoustic embeddings and a physics-informed modal surrogate with virtual standoffs; von Mises & Basquin fatigue maths convert modes into stress maps and defect likelihood; everything exports as DXF/PDF and persists to Supabase with row-level security.", {'size': 12, 'color': BODYTX})]], lsp=1.08)
chip(s, 0.5, 3.85, 1.85, "Key Features")
bullets(s, 0.5, 4.28, 7.4, [
    "Real-time GPU Chladni imaging with 64×64 amplitude/gradient LUT (O(1) per frame).",
    "1-tap Autopilot: zero-friction auto-inspect pipeline across all 12 screens.",
    "Audio resonance lock with note quantisation (F#5, A4 …) & Q-factor readout.",
    "AI defect caller: baseline-vs-live modal shift tolerance ±1.00 % + AST anomaly score.",
    "Safety planner: drag components, see nodal-line clearance before mounting.",
    "DXF vector + PDF audit export; RLS-secured inspection log; offline fallback engine.",
], size=11.8, gap=5)
phone(s, "scan", 8.5, 2.02, 3.35, "2. SCAN — EDGE DETECTION + P1–P4")
phone(s, "defects", 10.85, 2.02, 3.35, "9. DEFECTS — ANOMALY CALLER")
chamfer(s, 8.5, 5.85, 4.45, 0.95, cut=0.12, fill=SURF, line=BORDER)
txt(s, 8.7, 5.98, 4.1, 0.75,
    [[K("12-SCREEN GUIDED FLOW  ", size=9.5, spc=80),
      ("language → auth → setup → scan → material → viewport → tuner → modes → safety → stress → defects → export", {'size': 8.2, 'color': MUTED})]], lsp=1.15, sp_after=0)

# ================================================================ 7 · TOOLS & TECHNOLOGIES
s = slide(); header(s, "06 · TOOLKIT", "TOOLS & TECHNOLOGIES USED")
cols = [
    ("TECHNOLOGIES", ACC, [
        "Computer vision — edge/quad detection, P1–P4 homography",
        "WebGPU compute shaders (WGSL) particle dynamics",
        "Web Audio DSP — autocorrelation pitch & resonance lock",
        "Kirchhoff–Love plate theory, von Mises & Basquin fatigue",
        "Physics-Informed Neural surrogate (standoff clamping)",
        "Vision & audio transformers (DINOv2-small, AST)",
        "OAuth 2.0 + Postgres Row-Level Security",
    ]),
    ("SOFTWARE", ACC_DK, [
        "Next.js 15 (App Router, RSC) + React 19",
        "TypeScript 5.7 strict, Tailwind CSS 3.4 design tokens",
        "FastAPI + PyTorch microservice (uvicorn, CORS)",
        "Hugging Face Transformers 4.3 (lazy model load)",
        "Supabase — Postgres, Auth, RLS migrations",
        "Figma → SVG design-token extraction pipeline",
        "Vercel preview/production deployments",
    ]),
    ("HARDWARE / BROWSER APIS", WARN, [
        "Any modern laptop or phone — no dedicated NDT rig",
        "MediaStreams (camera) + Web Audio (microphone)",
        "WebGPU adapter (compute + render pipeline)",
        "Loudspeaker / function generator (optional exciter)",
        "Workpieces: FR4 PCB, Al-6061, steel, acrylic plates",
        "Touch/pointer input for pins, standoffs & components",
        "Works fully offline via on-device fallback engine",
    ]),
]
for i, (title, tcol, items) in enumerate(cols):
    x = 0.5 + i * 4.22
    chamfer(s, x, 2.05, 4.0, 4.75, cut=0.16, fill=CARD, line=BORDER)
    rect(s, x, 2.05, 4.0, 0.42, fill=SURF)
    txt(s, x + 0.18, 2.14, 3.7, 0.3, [[K(title, size=10.5, color=tcol, spc=140)]], sp_after=0)
    bullets(s, x + 0.2, 2.62, 3.65, items, size=10.6, gap=7, mcolor=tcol)

# ================================================================ 8 · STANDARDS
s = slide(); header(s, "07 · STANDARDS", "IEEE / W3C / ASTM STANDARDS FOLLOWED")
std = [
    ("IEEE 12207-2017", "Software lifecycle processes — capstone engineering: requirements → design → V&V → delivery."),
    ("IEEE 29148-2018", "Requirements engineering — SRS-style user stories & acceptance criteria per screen."),
    ("IEEE 1012-2016", "Verification & validation — built-in TestGuide autopilot executes the 12-screen E2E path."),
    ("IEEE 754-2019", "Floating-point arithmetic — float32 fidelity of WGSL/PyTorch modal & stress maths."),
    ("IEEE 802.11-2020", "Wi-Fi — field deployment connectivity; offline fallback covers link loss."),
    ("W3C WebGPU / Web Audio / MediaStreams", "Browser compute, audio capture & camera standards the whole pipeline relies on."),
    ("ASTM E1876-21", "Impulse excitation of vibration — dynamic E, G, ν calibration path for the material library."),
    ("ISO 9712:2021", "NDT personnel & traceability context for audit-grade inspection reports."),
]
for i, (code, desc) in enumerate(std):
    y = 2.05 + i * 0.56
    chamfer(s, 0.5, y, 3.35, 0.48, cut=0.1, fill=SURF, line=BORDER)
    txt(s, 0.68, y + 0.115, 3.1, 0.3, [[K(code, size=10, color=ACC_DK, spc=40)]], sp_after=0)
    txt(s, 4.05, y + 0.055, 8.75, 0.45, [[(desc, {'size': 10.6, 'color': BODYTX})]], sp_after=0, lsp=0.95)
txt(s, 0.5, 6.62, 12.3, 0.3, [[K("PROCESS ▸ ", size=9.5, color=ACC_DK, spc=80),
    ("Agile increments, type-safe codebase, RLS security review and per-commit Vercel preview tests map the build to IEEE 12207/1012 practice.", {'size': 9.5, 'color': MUTED})]], sp_after=0)

# ================================================================ 9 · SYSTEM ARCHITECTURE
s = slide(); header(s, "08 · ARCHITECTURE", "SYSTEM ARCHITECTURE")
layers = [
    ("L5 · DATA & DELIVERY", "Supabase Postgres + RLS · DXF/PDF export · Vercel edge · Google OAuth", NAVY),
    ("L4 · DOMAIN PHYSICS ENGINE", "Kirchhoff–Love (m,n) modes · von Mises & Basquin fatigue · Q / loss-factor damping", WARN),
    ("L3 · AI MICROSERVICE (FastAPI + PyTorch)", "DINOv2-small segmentation · AST acoustic embeddings · ModalPINNSurrogate", VOLT),
    ("L2 · EDGE PERCEPTION (React hooks)", "useBoundaryDetection · useAudioPitch · useChladniShader (WGSL compute)", ACC),
    ("L1 · SENSING (browser)", "Camera frames · microphone stream · touch pins P1–P4 · loudspeaker exciter", MUTED),
]
for i, (t, d, col) in enumerate(layers):
    y = 2.02 + i * 0.94
    chamfer(s, 0.5, y, 6.1, 0.80, cut=0.12, fill=CARD if i % 2 == 0 else SURF, line=BORDER)
    rect(s, 0.5, y, 0.09, 0.80, fill=col)
    txt(s, 0.75, y + 0.10, 5.7, 0.3, [[K(t, size=10.5, color=col if col != MUTED else MUTED, spc=60)]], sp_after=0)
    txt(s, 0.75, y + 0.40, 5.7, 0.35, [[(d, {'size': 9.6, 'color': BODYTX})]], sp_after=0)
    if i < 4:
        arrow(s, 3.55, y + 0.80, 3.55, y + 0.94, color=BORDERHI, w=1.2)
rx = 7.0
boxes = [
    (rx, 2.02, 2.85, 0.62, "NEXT.JS 15 RSC UI", "12 guided screens + HUD kit"),
    (rx + 3.05, 2.02, 2.85, 0.62, "REACT HOOKS", "CV · audio · WebGPU pipelines"),
    (rx, 3.06, 2.85, 0.62, "FASTAPI /api/ai/*", "detect · audio · health"),
    (rx + 3.05, 3.06, 2.85, 0.62, "HF / PYTORCH MODELS", "DINOv2 · AST · PINN surrogate"),
    (rx, 4.10, 2.85, 0.62, "SUPABASE (RLS)", "profiles · scans · sessions"),
    (rx + 3.05, 4.10, 2.85, 0.62, "EXPORT ENGINE", "DXF vector · PDF audit report"),
]
for (x, y, w, h, t, d) in boxes:
    chamfer(s, x, y, w, h, cut=0.1, fill=CARD, line=BORDERHI)
    txt(s, x + 0.14, y + 0.08, w - 0.25, 0.26, [[K(t, size=9.6, color=ACC_DK, spc=40)]], sp_after=0)
    txt(s, x + 0.14, y + 0.34, w - 0.25, 0.26, [[(d, {'size': 8.4, 'color': MUTED})]], sp_after=0)
arrow(s, rx + 2.85, 2.33, rx + 3.05, 2.33, w=1.4)
arrow(s, rx + 1.42, 2.64, rx + 1.42, 3.06, w=1.4)
arrow(s, rx + 4.47, 2.64, rx + 4.47, 3.06, w=1.4)
arrow(s, rx + 3.05, 3.37, rx + 2.85, 3.37, w=1.4)
arrow(s, rx + 1.42, 3.68, rx + 1.42, 4.10, w=1.4)
arrow(s, rx + 4.47, 3.68, rx + 4.47, 4.10, w=1.4)
chamfer(s, rx, 5.05, 5.9, 0.85, cut=0.12, fill=WARN_BG, line=WARN, lw=1.2, dash="dash")
txt(s, rx + 0.2, 5.16, 5.5, 0.7,
    [[K("GRACEFUL DEGRADATION  ", size=9.5, color=WARN, spc=80),
      ("if the AI microservice is unreachable the frontend automatically falls back to its built-in browser CV / WebAudio / analytic-physics engine — inspection never blocks.", {'size': 9.3, 'color': BODYTX})]], lsp=1.05, sp_after=0)
txt(s, rx, 6.1, 5.9, 0.6,
    [[K("DATA FLOW  ", size=9, spc=80),
      ("camera/mic → hooks → GPU viewport → AI enrich → physics infer → report → cloud log", {'size': 8.6, 'color': MUTED})]], sp_after=0)

# ================================================================ 10 · FLOWCHART + ALGORITHM
s = slide(); header(s, "09 · WORKING", "END-TO-END FLOWCHART & ALGORITHM STEPS")
nodes = [
    ("START", "start"),
    ("1 · CAPTURE & AMBIENT NOISE FLOOR", "n"),
    ("2 · GEOMETRY SOLVE — CV edges → P1–P4 → mm²", "n"),
    ("3 · MATERIAL & (m,n) MODE SELECT", "n"),
    ("4 · EXCITE & RESONANCE-LOCK (mic autocorrelation)", "n"),
    ("5 · GPU MODAL IMAGING — 32,768 particles", "n"),
    ("6 · STRESS + DEFECT INFER (von Mises · AST · PINN)", "n"),
    ("modal shift > ±1 % or anomaly ≥ θ ?", "d"),
    ("7 · FLAG · DXF/PDF REPORT · SUPABASE LOG", "n"),
    ("END", "end"),
]
ny = 1.98
for i, (label, kind) in enumerate(nodes):
    h = 0.30 if kind in ("start", "end") else (0.44 if kind == "d" else 0.36)
    if kind == "d":
        d = chamfer(s, 0.75, ny, 4.5, h, cut=0.22, fill=WARN_BG, line=WARN, lw=1.3)
    elif kind in ("start", "end"):
        d = chamfer(s, 1.6, ny, 2.8, h, cut=0.14, fill=NAVY, line=None)
    else:
        d = chamfer(s, 0.75, ny, 4.5, h, cut=0.10, fill=CARD, line=BORDERHI)
    tf = d.text_frame; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.margin_left = Inches(0.1); tf.margin_right = Inches(0.05); tf.margin_top = tf.margin_bottom = 0
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = label
    r.font.size = Pt(9.3 if kind == "n" else 9.6)
    r.font.bold = kind != "n"
    r.font.name = FONT
    r.font.color.rgb = C("FFFFFF" if kind in ("start", "end") else (WARN if kind == "d" else NAVY))
    if i < len(nodes) - 1:
        arrow(s, 3.0, ny + h, 3.0, ny + h + 0.10, color=ACC, w=1.3)
    ny += h + 0.10
arrow(s, 5.25, 5.36, 5.75, 5.36, color=MUTED, w=1.2, head=False)
arrow(s, 5.75, 5.36, 5.75, 3.94, color=MUTED, w=1.2, head=False)
arrow(s, 5.75, 3.94, 5.25, 3.94, color=MUTED, w=1.2)
txt(s, 5.32, 5.14, 1.2, 0.22, [[K("NO", size=8.5, color=MUTED, spc=40)]], sp_after=0)
txt(s, 5.32, 3.70, 1.4, 0.22, [[K("re-sweep", size=8.5, color=MUTED, spc=40)]], sp_after=0)
txt(s, 3.15, 5.60, 1.0, 0.22, [[K("YES", size=8.5, color=SAFE, spc=40)]], sp_after=0)
alg = [
    ("STEP", "PROCESS", "INPUT", "OUTPUT"),
    ("1", "Capture & noise floor", "Camera + mic streams", "Ambient dB baseline"),
    ("2", "Boundary detection", "Video frames", "P1–P4 quad, area mm²"),
    ("3", "Material / mode select", "User choice", "E, ρ, ν, η; (m,n), f₀"),
    ("4", "Resonance lock", "Mic FFT/autocorr", "Locked Hz + note + Q"),
    ("5", "GPU modal imaging", "f, (m,n), standoffs", "Live nodal particle field"),
    ("6", "Stress & defect infer", "Modes + material", "von Mises map, anomaly score"),
    ("7", "Report & log", "Session bundle", "DXF + PDF + RLS row"),
]
table(s, alg, 6.6, 2.02, 6.25, [0.55, 1.85, 1.85, 2.0], rowh=0.55, headh=0.32, fs=8.8)
txt(s, 6.6, 6.72, 6.2, 0.4, [[K("DECISION RULE ▸ ", size=9, color=WARN, spc=60),
    ("baseline-vs-live modal shift beyond ±1.00 % tolerance, or AST anomaly ≥ θ ⇒ REVIEW NEEDED flag.", {'size': 9, 'color': BODYTX})]], sp_after=0)

# ================================================================ 11 · HOW IT WORKS OVERVIEW
s = slide(); header(s, "10 · HOW IT WORKS", "HOW IT WORKS — FIVE-STAGE INSPECTION PIPELINE")
stages = [
    ("S1", "CAPTURE & GEOMETRY", "Camera frames plate; CV edge detection + draggable P1–P4 pins solve true mm geometry & ambient noise floor."),
    ("S2", "MATERIAL & EXCITE", "Material library sets E, ρ, ν; speaker sweep excites the plate while the Live AR viewport prepares the particle field."),
    ("S3", "LOCK & MODAL GALLERY", "Mic autocorrelation locks resonance to 0.01 Hz; eigenmode gallery lists (m,n), f₀, Q and resonance gain."),
    ("S4", "SAFETY & STRESS", "Drag components for nodal clearance; von Mises + Basquin fatigue paint safe / moderate / extreme zones."),
    ("S5", "DEFECTS & REPORT", "Baseline-vs-live shift + AST anomaly call defects; DXF/PDF export and RLS log close the loop."),
]
for i, (code, t, d) in enumerate(stages):
    x = 0.5 + i * 2.52
    chamfer(s, x, 2.1, 2.32, 2.55, cut=0.14, fill=CARD if i % 2 == 0 else SURF, line=BORDER)
    rect(s, x, 2.1, 2.32, 0.4, fill=SURF if i % 2 == 0 else CARD)
    txt(s, x + 0.12, 2.18, 2.1, 0.28, [[K(code, size=10, spc=120), (t, {'size': 9.3, 'color': NAVY, 'bold': True, 'spc': 40})]], sp_after=0)
    txt(s, x + 0.14, 2.62, 2.05, 1.95, [[(d, {'size': 9.3, 'color': BODYTX})]], lsp=1.06, sp_after=0)
    if i < 4:
        arrow(s, x + 2.32, 3.35, x + 2.52, 3.35, w=1.6)
txt(s, 0.5, 4.95, 12.3, 0.3, [[K("12-SCREEN NAVIGATION FLOW (IMPLEMENTED ROUTES)", size=10, spc=120)]], sp_after=0)
flow = ["/language", "/auth", "/setup", "/scan", "/material", "/viewport", "/tuner", "/modes", "/safety", "/stress", "/defects", "/export"]
for i, f in enumerate(flow):
    x = 0.5 + i * 1.045
    chamfer(s, x, 5.32, 0.96, 0.42, cut=0.09, fill=CARD if i % 2 else SURF, line=BORDER)
    txt(s, x, 5.42, 0.96, 0.26, [[(f, {'size': 8.2, 'color': ACC_DK if i in (5, 10) else MUTED, 'bold': i in (5, 10), 'spc': 10})]], align=PP_ALIGN.CENTER, sp_after=0)
    if i < 11:
        arrow(s, x + 0.96, 5.53, x + 1.045, 5.53, color=BORDERHI, w=1.0)
txt(s, 0.5, 5.95, 12.3, 0.8,
    [[K("AUTOPILOT ▸ ", size=9.5, color=VOLT, spc=80),
      ("a single tap runs the zero-friction auto-inspect pipeline across every screen above; each screen is non-blocking, so an inspector can jump in at any stage. Voice guide + locale screen make the flow shop-floor friendly.", {'size': 9.8, 'color': BODYTX})]], lsp=1.1, sp_after=0)

def stage_slide(kick, title, obj, happens, funcs, out, ph1, ph2, cap1, cap2, tag):
    s = slide(); header(s, kick, title)
    chip(s, 0.5, 2.05, 1.6, "Objective")
    txt(s, 0.5, 2.46, 7.5, 0.6, [[(obj, {'size': 12, 'color': ACC_DK, 'bold': True})]], lsp=1.05)
    chip(s, 0.5, 3.12, 2.0, "What happens")
    txt(s, 0.5, 3.53, 7.5, 1.1, [[(happens, {'size': 11.6, 'color': BODYTX})]], lsp=1.08)
    chip(s, 0.5, 4.68, 1.9, "Key functions")
    bullets(s, 0.5, 5.08, 7.5, funcs, size=11.2, gap=4)
    chip(s, 0.5, 6.5, 1.35, "Output", fill=SAFE_BG, line=SAFE, tcolor=SAFE)
    txt(s, 2.0, 6.55, 6.2, 0.5, [[(out, {'size': 11, 'color': BODYTX})]], lsp=1.0)
    phone(s, ph1, 8.45, 2.0, 3.4, cap1)
    phone(s, ph2, 10.8, 2.0, 3.4, cap2)
    chamfer(s, 8.45, 5.95, 4.42, 0.85, cut=0.12, fill=SURF, line=BORDER)
    txt(s, 8.65, 6.06, 4.05, 0.65, [[K(tag[0] + "  ", size=9.3, spc=80), (tag[1], {'size': 9.3, 'color': BODYTX})]], lsp=1.05, sp_after=0)
    return s

stage_slide("11 · HOW IT WORKS — STEP 1/5", "STEP 1 · CAPTURE & GEOMETRY SOLVE",
    "Digitise the physical workpiece into a metric-accurate digital twin using only the camera.",
    "Live video frames are processed on-device: edge detection proposes the plate boundary while four draggable corner pins (P1–P4) let the inspector snap the quad exactly. A perspective solve converts pixel quad → aspect ratio + surface area in mm², and the ambient noise floor is sampled so later acoustic readings can be trusted.",
    ["Hardware health check + ambient noise floor (setup screen).",
     "Optical edge detection + draggable P1–P4 boundary pins.",
     "Perspective quad solve → aspect ratio & area in mm².",
     "SCANNED QUAD AR badge confirms lock for downstream stages."],
    "Metric digital twin (quad + mm²) + noise-floor baseline.",
    "setup", "scan", "1. SETUP & CALIBRATION", "2. SCAN — TARGET SETUP",
    ("HOOK ▸", "useBoundaryDetection.ts — optical frame processor, pin drag state, mm² solve."))

stage_slide("12 · HOW IT WORKS — STEP 2/5", "STEP 2 · MATERIAL PROFILE & EXCITATION",
    "Bind real material constants to the twin and excite the plate — the viewport becomes virtual sand.",
    "The material screen loads FR4 / Al-6061 / steel / acrylic constants (E, ρ, ν, yield, loss factor, Basquin σf′ & b). The Live AR viewport then computes Kirchhoff–Love eigen-frequencies for the scanned quad, and one tap on ‘Excite Mode & Migrate Chladni Sand’ runs the WebGPU compute shader: 32,768 particles migrate onto nodal lines over the camera-perspective quad, with LDV-style heatmap, mode chips and 2D/3D/AR view toggles.",
    ["Material library with real elastic + fatigue constants.",
     "Eigen-frequency solve for scanned aspect ratio (376/616/1502 Hz…).",
     "WebGPU particle migration onto nodal lines (virtual sand).",
     "Tone / Mic-React / AR / 3D / 2D interaction modes."],
    "Excited modal field rendered live over the real board.",
    "material", "viewport", "3. MATERIAL", "4. LIVE AR — KIRCHHOFF-LOVE FEA",
    ("HOOK ▸", "useChladniShader.ts — WebGPU compute/render, 64×64 W/∇W LUT, O(1) frames."))

stage_slide("13 · HOW IT WORKS — STEP 3/5", "STEP 3 · RESONANCE LOCK & MODE GALLERY",
    "Lock the true resonance with the microphone and catalogue every harmonic eigenmode.",
    "The Note screen runs an autocorrelation pitch detector over the mic stream, quantises to musical notes (F#5, A4 …) with cents readout and declares resonance lock with a Q / damping estimate. The Shapes screen then galleries all (m, n) eigenmodes with eigen-frequency, Q and resonance gain, and compares baseline vs live patterns against the ±1.00 % tolerance.",
    ["Autocorrelation pitch detection on live mic stream.",
     "Note quantisation & cents readout (e.g. F#5, A4).",
     "Resonance lock + Q-factor / damping estimate.",
     "Eigenmode gallery: indices, f₀, Q, resonance gain, peak flag."],
    "Locked f₀ (0.01 Hz readout) + full eigenmode catalogue.",
    "tuner", "modes", "5. NOTE — PITCH DETECTOR", "6. SHAPES — EIGENMODE GALLERY",
    ("HOOK ▸", "useAudioPitch.ts — autocorrelation → note quantisation → resonance lock."))

stage_slide("14 · HOW IT WORKS — STEP 4/5", "STEP 4 · SAFETY PLANNING & STRESS MAPPING",
    "Turn modal images into engineering evidence: mounting safety and stress hotspots.",
    "The Safety screen lets components be dragged over the nodal map and scores nodal-line clearance before mounting. The Stress screen converts locked modes + material constants into a dynamic von Mises heatmap with safe / moderate / extreme zones and Basquin fatigue life readouts, so reviewers see where energy concentrates — not just pretty patterns.",
    ["Component drag-and-drop nodal-clearance safety check.",
     "Dynamic von Mises heatmap with zone classification.",
     "Basquin fatigue life + loss-factor damping readouts.",
     "Hotspot localisation feeding the defect stage."],
    "Safety plan + stress heatmap with quantified zones.",
    "safety", "stress", "7. SAFETY — PLACEMENT CHECK", "8. STRESS — VON MISES HEATMAP",
    ("PHYSICS ▸", "utils/physics.ts — Kirchhoff–Love, von Mises, Basquin, Q/η damping."))

stage_slide("15 · HOW IT WORKS — STEP 5/5", "STEP 5 · DEFECT CALL, REPORT & AUDIT LOG",
    "Close the loop with an anomaly call and traceable, audit-grade artefacts.",
    "The Defects screen fuses baseline-vs-live modal shift, AST acoustic anomaly features and the PINN surrogate into a defect likelihood call with hotspot tags — explicitly an indication for review, never an over-claim. The session bundle (quad, material, modes, shift table, stress zones, calls) exports as DXF vector + PDF report and persists to Supabase (profiles, workpiece_scans, inspection_sessions) under row-level security.",
    ["±1.00 % shift rule + AST anomaly score fusion.",
     "DXF vector export of nodal lines & hotspot quads.",
     "PDF audit report with tolerances & disclaimers.",
     "RLS-secured inspection log with revisit & compare."],
    "Defect call + DXF/PDF artefacts + RLS inspection log row.",
    "defects", "export", "9. DEFECTS — ANOMALY CALLER", "10. EXPORT — REPORT & LOG",
    ("AI ▸", "DINOv2-small seg · MIT AST · ModalPINNSurrogate — lazy-loaded, CPU/GPU auto."))

# ================================================================ 17 · UI GALLERY (all 12 real screens)
s = slide(); header(s, "16 · PRODUCT", "REAL UI — ALL 12 IMPLEMENTED SCREENS (LIVE BUILD)")
gal = [("language", "1 · LOCALE"), ("auth", "AUTH / OAUTH"), ("setup", "1 · SETUP"), ("scan", "2 · SCAN"),
       ("material", "3 · MATERIAL"), ("viewport", "4 · LIVE AR"), ("tuner", "5 · NOTE"), ("modes", "6 · SHAPES"),
       ("safety", "7 · SAFETY"), ("stress", "8 · STRESS"), ("defects", "9 · DEFECTS"), ("export", "10 · EXPORT")]
for i, (g, c) in enumerate(gal):
    row, col = divmod(i, 6)
    x = 2.49 + col * 1.4587
    y = 1.95 + row * 2.47
    phone(s, g, x, y, 2.30, c)
txt(s, 0.5, 6.90, 12.3, 0.2,
    [[K("DESIGN SYSTEM ▸ ", size=9.5, spc=80),
      ("light engineering palette — bg #F8FAFC, cards #FFFFFF, sky accent #0284C7, chamfer clips, AR grid; dark mode ships as a toggle (this deck reuses the same tokens).", {'size': 9.5, 'color': MUTED})]], sp_after=0)

# ================================================================ 18 · NOVELTY
s = slide(); header(s, "17 · NOVELTY", "NOVELTY & INNOVATION")
nov = [
    ("N1", "FIRST BROWSER-NATIVE CHLADNI IMAGER", "WebGPU WGSL compute animates 32,768 particles into live nodal fields — sand, shaker and strobe replaced by a URL."),
    ("N2", "ZERO-INSTRUMENTATION NDT", "Camera + microphone + speaker of any laptop/phone substitute LDV / impedance analysers; cost drops by orders of magnitude."),
    ("N3", "INTERACTIVE PHYSICS-INFORMED SURROGATE", "ModalPINNSurrogate with Gaussian virtual-standoff clamping gives instant what-if boundary-condition analysis in the browser."),
    ("N4", "QUAD-MODAL FUSION DEFECT CALLER", "Optical geometry + acoustic resonance (AST) + analytical Kirchhoff–Love stress + baseline shift fuse into one anomaly score with hotspots."),
    ("N5", "GRACEFUL-DEGRADATION AI DELIVERY", "FastAPI/PyTorch enrichment with automatic on-device CV/WebAudio/physics fallback — field inspections never block on the cloud."),
    ("N6", "AUDIT-GRADE NDT RECORDS", "DXF vector nodal maps + PDF reports + RLS-secured inspection log bind evidence to identity — traceability absent in prior art."),
]
for i, (code, t, d) in enumerate(nov):
    x = 0.5 + (i % 2) * 6.25
    y = 2.05 + (i // 2) * 1.62
    chamfer(s, x, y, 6.05, 1.45, cut=0.14, fill=CARD if i % 2 == 0 else SURF, line=BORDER)
    rect(s, x, y, 0.09, 1.45, fill=VOLT if i % 3 == 0 else ACC)
    txt(s, x + 0.25, y + 0.12, 1.0, 0.3, [[K(code, size=11, spc=120)]], sp_after=0)
    txt(s, x + 0.95, y + 0.13, 4.95, 0.32, [[(t, {'size': 11.5, 'bold': True, 'color': NAVY, 'spc': 20})]], sp_after=0)
    txt(s, x + 0.25, y + 0.52, 5.6, 0.85, [[(d, {'size': 10.2, 'color': BODYTX})]], lsp=1.06, sp_after=0)
txt(s, 0.5, 6.82, 12.3, 0.35, [[K("POSITIONING ▸ ", size=9.5, color=VOLT, spc=80),
    ("prior Chladni/CV research = offline photo classification; prior PINN work = offline surrogates. HARMONIX-AR is the first real-time, instrument-free, browser-delivered fusion of both.", {'size': 9.5, 'color': MUTED})]], sp_after=0)

# ================================================================ 19 · RESULTS
s = slide(); header(s, "18 · EVALUATION", "RESULTS AND ANALYSIS")
res = [
    ("SUBSYSTEM", "DEMONSTRATED RESULT IN BUILD"),
    ("GPU modal imaging", "32,768 particles @ interactive rate; 64×64 W/∇W LUT → O(1) frame update, zero trig in shader"),
    ("Resonance lock", "Autocorrelation pitch → 0.01 Hz readout, note quantisation (F#5/A4), Q & damping estimate"),
    ("Geometry solve", "4-pin perspective quad → aspect ratio + area in mm² from live camera frames"),
    ("Material library", "FR4, Al-6061, steel, acrylic with E, ρ, ν, c, yield, η, Basquin σf′ & b constants"),
    ("Defect calling", "Baseline-vs-live modal shift table; Wave-2 −1.84 % > ±1.00 % tolerance ⇒ REVIEW NEEDED + hotspot"),
    ("AI microservice", "DINOv2-small segmentation, AST AudioSet embeddings, PINN surrogate w/ standoff clamp; CPU/GPU auto"),
    ("Delivery & audit", "Vercel + Supabase RLS sessions; DXF vector + PDF report export; offline browser fallback verified"),
]
table(s, res, 0.5, 2.02, 7.6, [1.95, 5.65], rowh=0.56, headh=0.34, fs=8.9)
chip(s, 0.5, 6.5, 2.5, "Performance analysis")
txt(s, 3.15, 6.53, 5.0, 0.6, [[("Real-time interactive loop (no batch queue), zero dedicated hardware, 1-tap autopilot, traceable records.", {'size': 10.2, 'color': BODYTX})]], lsp=1.0)
img_fit(s, os.path.join(IMG, "chladni-plate-vibration-resonance-sand-p-2.jpg"), 8.45, 2.02, 4.4, 2.3)
txt(s, 8.45, 4.35, 4.4, 0.35, [[K("PHYSICAL CHLADNI REFERENCE — WHAT WE VIRTUALISE", size=8.5, color=MUTED, spc=40)]], align=PP_ALIGN.CENTER, sp_after=0)
chamfer(s, 8.45, 4.82, 4.4, 2.0, cut=0.14, fill=SAFE_BG, line=SAFE, lw=1.2)
txt(s, 8.68, 4.97, 3.95, 1.75,
    [[K("ANALYSIS ▸ ", size=9.5, color=SAFE, spc=80)],
     [("Modal shifts within ±1 % pass silently; beyond tolerance the system localises the hotspot and recommends a localised check — explicitly labelled as indication, not confirmation, of damage (honest NDT semantics).", {'size': 9.8, 'color': BODYTX})]], lsp=1.08, sp_after=4)

# ================================================================ 20 · SE PROCESS
s = slide(); header(s, "19 · ENGINEERING PROCESS", "SOFTWARE ENGINEERING PROCESS & QA")
chip(s, 0.5, 2.05, 2.6, "Lifecycle (IEEE 12207)")
bullets(s, 0.5, 2.48, 6.0, [
    ("Requirements ▸ ", "SRS-style user stories & acceptance criteria per screen (IEEE 29148)."),
    ("Design ▸ ", "Figma SVGs → extracted design-token table → Tailwind theme; hook/service boundaries."),
    ("Implementation ▸ ", "TypeScript strict, Next.js 15 RSC, FastAPI microservice, SQL migrations under version control."),
    ("V&V ▸ ", "built-in TestGuide + Autopilot replays the 12-screen E2E path (IEEE 1012); RLS security review."),
    ("Delivery ▸ ", "Vercel preview per commit → production; Supabase migration as single source of truth."),
], size=11.4, gap=6)
chip(s, 0.5, 5.35, 2.6, "Quality attributes")
bullets(s, 0.5, 5.78, 6.0, [
    "Reliability — non-blocking screens + offline fallback engine.",
    "Performance — LUT-driven O(1) GPU updates; lazy model loading.",
    "Security — OAuth 2.0, RLS policies, server-only service role key.",
    "Maintainability — token-driven UI kit (ChamferedCard, Hud*), typed DB schema.",
], size=11.4, gap=5)
chamfer(s, 6.9, 2.05, 5.95, 4.8, cut=0.16, fill=CARD, line=BORDER)
txt(s, 7.15, 2.25, 5.5, 0.3, [[K("REPOSITORY STRUCTURE", size=10.5, spc=120)]], sp_after=0)
repo = [
    "src/app/…            12 guided routes (language → export)",
    "src/hooks/           useAudioPitch · useBoundaryDetection ·",
    "                     useChladniShader (physics & DSP core)",
    "src/components/ui/   ChamferedCard · HudHeader · HudNav …",
    "src/utils/physics.ts Kirchhoff–Love, von Mises, Basquin",
    "src/context/         autopilot.tsx (1-tap inspection)",
    "ai-backend/main.py   FastAPI + DINOv2 + AST + PINN",
    "supabase/migrations/ profiles · workpiece_scans ·",
    "                     inspection_sessions + RLS policies",
    "public/assets/       Figma SVG mockups (design source)",
]
txt(s, 7.15, 2.62, 5.55, 4.1, [[(l, {'size': 9.4, 'color': BODYTX if i % 3 != 2 else MUTED}) for i, l in enumerate(repo)][i:i+1] for i in range(0, len(repo), 1)], sp_after=3, lsp=1.0)

# ================================================================ 21 · ADVANTAGES
s = slide(); header(s, "20 · ADVANTAGES", "ADVANTAGES OF THE PROPOSED SYSTEM")
adv = [
    "24/7 inspection capability in a URL — no lab booking, no sand, no shaker warm-up.",
    "Orders-of-magnitude cheaper than LDV / impedance-analyser modal testing.",
    "Objective, repeatable readings: locked Hz, Q, shift % — not inspector opinion.",
    "Real-time interactive what-if: standoffs, components and modes update instantly.",
    "Honest NDT semantics: indications flagged for review, never over-claimed as damage.",
    "Audit trail by design — DXF + PDF + RLS log satisfy traceability requirements.",
    "Runs offline in the field via the on-device fallback engine; syncs when back online.",
    "Sustainable software engineering: token-driven UI, typed contracts, migration-first data.",
]
bullets(s, 0.5, 2.15, 7.6, adv, size=12.6, gap=9)
phone(s, "export", 9.7, 1.95, 4.8, "10. EXPORT — TRACEABLE REPORT")
chamfer(s, 8.5, 2.6, 1.0, 3.2, cut=0.1, fill=SURF, line=BORDER)
txt(s, 8.58, 2.8, 0.85, 2.9, [[K("COST", size=9, color=SAFE, spc=60)], [("↓↓", {'size': 12, 'color': SAFE, 'bold': True})], [K("TIME", size=9, color=SAFE, spc=60)], [("↓↓", {'size': 12, 'color': SAFE, 'bold': True})], [K("RISK", size=9, color=SAFE, spc=60)], [("↓", {'size': 12, 'color': SAFE, 'bold': True})]], sp_after=8)

# ================================================================ 22 · CHALLENGES
s = slide(); header(s, "21 · LIMITATIONS", "CHALLENGES / LIMITATIONS")
chal = [
    ("Optical dependence ▸ ", "boundary solve needs reasonable lighting & contrast; glossy or cluttered scenes need manual pin correction."),
    ("Acoustic environment ▸ ", "very noisy shop floors reduce resonance-lock SNR despite noise-floor gating."),
    ("WebGPU availability ▸ ", "older browsers lack WebGPU; the canvas fallback lowers particle count."),
    ("Model scope ▸ ", "Kirchhoff–Love assumptions suit thin, flat, isotropic-ish plates; thick/curved parts need richer elements."),
    ("AI cold start ▸ ", "lazy-loading DINOv2/AST costs a few seconds on first call (CPU hosts)."),
    ("Indication, not certification ▸ ", "outputs screen for review; certified NDT still requires qualified personnel (ISO 9712)."),
]
for i, (h, d) in enumerate(chal):
    y = 2.05 + i * 0.78
    chamfer(s, 0.5, y, 8.1, 0.66, cut=0.12, fill=CARD if i % 2 == 0 else SURF, line=BORDER)
    txt(s, 0.72, y + 0.09, 7.7, 0.5, [[(h, {'size': 11, 'bold': True, 'color': WARN}), (d, {'size': 10.6, 'color': BODYTX})]], lsp=0.98, sp_after=0)
chip(s, 8.9, 2.05, 2.4, "Possible improvements", fill=SAFE_BG, line=SAFE, tcolor=SAFE)
bullets(s, 8.9, 2.5, 3.95, [
    "Larger labelled defect dataset for calibrated anomaly thresholds.",
    "Multi-camera stereo for curved workpieces.",
    "ONNX/WebGPU-direct model ports to kill cold start.",
], size=10.8, gap=7, mcolor=SAFE)
img_fit(s, os.path.join(IMG, "non-destructive-testing-ultrasonic-inspe-3.jpg"), 8.9, 4.35, 3.95, 2.3)

# ================================================================ 23 · FUTURE
s = slide(); header(s, "22 · ROADMAP", "FUTURE ENHANCEMENTS")
fut = [
    "On-device WebGPU inference (Transformers.js) for fully offline AI enrichment.",
    "Thermal + IR camera fusion for delamination screening of composites.",
    "Digital-twin history: drift analytics across repeated inspections of the same asset.",
    "Federated learning of anomaly thresholds across factories without sharing data.",
    "AR overlay (WebXR) projecting nodal lines directly on the physical plate.",
    "Robotic excitation: drone/robot tap path planning from the safety screen.",
    "Certificate chain: signed PDF reports with verifier QR + ISO 9712 operator IDs.",
]
bullets(s, 0.5, 2.15, 7.5, fut, size=12.4, gap=9)
phone(s, "export", 9.7, 2.0, 4.85, "REPORT → SIGNED CERTIFICATE CHAIN")
chamfer(s, 8.5, 3.0, 1.0, 2.6, cut=0.1, fill=SURF, line=BORDER)
txt(s, 8.58, 3.2, 0.85, 2.3, [[K("v1", size=10)], [("shipped", {'size': 8, 'color': MUTED})], [K("v2", size=10)], [("on-device", {'size': 8, 'color': MUTED})], [K("v3", size=10)], [("fleet", {'size': 8, 'color': MUTED})]], sp_after=6)

# ================================================================ 24 · CONCLUSION
s = slide(); header(s, "23 · CONCLUSION", "CONCLUSION")
chip(s, 0.5, 2.05, 1.4, "Summary")
txt(s, 0.5, 2.46, 7.6, 1.3,
    [[("HARMONIX-AR fuses computer vision, audio DSP, GPU physics simulation and transformer AI into a single browser-delivered NDT workflow. It replaces the sand-plate rig and the vibrometer with a camera, a microphone and a compute shader — and closes the loop with audit-grade DXF/PDF/RLS records.", {'size': 12.4, 'color': BODYTX})]], lsp=1.1)
chip(s, 0.5, 3.95, 2.3, "Key achievements")
bullets(s, 0.5, 4.38, 7.6, [
    "Real-time WebGPU Chladni imaging (32,768 particles) with eigenmode gallery.",
    "Microphone-only resonance lock with note quantisation and Q estimation.",
    "Quad-modal defect calling: CV + AST + PINN + analytical stress, ±1 % shift rule.",
    "12-screen guided flow with 1-tap autopilot, voice guide and locale support.",
    "Secure, traceable delivery: OAuth, RLS log, DXF/PDF export, offline fallback.",
], size=11.8, gap=6)
chamfer(s, 8.45, 2.05, 4.4, 4.8, cut=0.16, fill=CARD, line=ACC)
s.shapes.add_picture(HXLOGO, Inches(10.25), Inches(2.35), height=Inches(1.0))
txt(s, 8.7, 3.5, 3.9, 0.4, [[("HARMONIX-AR", {'size': 15, 'bold': True, 'color': NAVY, 'spc': 160})]], align=PP_ALIGN.CENTER, sp_after=0)
txt(s, 8.7, 3.86, 3.9, 0.3, [[K("ACOUSTIC RESONANCE & NDT INTELLIGENCE", size=8, color=MUTED, spc=100)]], align=PP_ALIGN.CENTER, sp_after=0)
txt(s, 8.7, 4.35, 3.9, 2.3,
    [[K("NOVELTY IN ONE LINE", size=9.5, color=VOLT, spc=100)],
     [("The first real-time, instrument-free, browser-native Chladni resonance imager with physics-informed AI defect calling and audit-grade traceability.", {'size': 11, 'color': ACC_DK})],
     [(" ", {'size': 4})],
     [("NANDHEESA PRASAD K · 192511181", {'size': 9, 'color': MUTED, 'spc': 40})],
     [("GUIDE · Dr.Surendran R", {'size': 9, 'color': MUTED, 'spc': 40})]], sp_after=6, lsp=1.08)

# ================================================================ 25 · REFERENCES
s = slide(); header(s, "24 · REFERENCES", "REFERENCES")
refs = [
    "[1] W3C, “WebGPU Specification,” W3C Candidate Recommendation Draft, 2025. [Online]. Available: https://www.w3.org/TR/webgpu/",
    "[2] M. Oquab et al., “DINOv2: Learning Robust Visual Features without Supervision,” Transactions on Machine Learning Research, 2024.",
    "[3] Y. Gong, Y.-A. Chung and J. Glass, “AST: Audio Spectrogram Transformer,” Proc. Interspeech 2021, pp. 5336–5340.",
    "[4] A. Kumar and K. P. Wani, “Modal Frequency Prediction of Chladni Patterns Using Machine Learning,” Open Journal of Acoustics, vol. 12, no. 1, pp. 1–16, 2024.",
    "[5] K. Wani, N. Khedkar and V. Jatti, “Classification and Prediction of Vibration Natural Frequencies of a Circular Plate Using Chladni Patterns and Deep Learning Techniques,” Springer ADCIS, pp. 187–204, 2024.",
    "[6] “Study and Experiment for the Automatic Identification of Plate Vibration Frequencies Based on Chladni Patterns,” Applied Sciences, vol. 16, no. 18, art. 9246, 2026.",
    "[7] “Prediction of blade vibration response with uncertainty propagation using physics-informed neural networks and physics-informed Gaussian process regression,” Aerospace Science and Technology, 2025.",
    "[8] “Physics-informed neural operators for predicting structural intensity from laser Doppler vibrometry measurements of plates,” Mechanical Systems and Signal Processing, 2026.",
    "[9] C. De La Vega Martin, R. Diaz Fernandez and M. Sandler, “Evaluation of Neural Surrogates for Physical Modelling Synthesis of Nonlinear Elastic Plates,” arXiv:2507.12563, 2025.",
    "[10] ASTM E1876-21, “Standard Test Method for Dynamic Young’s Modulus, Shear Modulus, and Poisson’s Ratio by Impulse Excitation of Vibration,” ASTM International, 2021.",
    "[11] “Application of Machine Learning Models in Predicting Vibration Frequencies of Thin Variable Thickness Plates,” Materials, vol. 19, no. 1, art. 205, 2026.",
    "[12] Vercel Inc., Next.js 15 & React 19 Documentation; Supabase Documentation (Postgres RLS), 2025. [Online].",
]
half = 6
for i, rtext in enumerate(refs):
    col = i // half
    rowi = i % half
    x = 0.5 + col * 6.3
    y = 2.05 + rowi * 0.82
    txt(s, x, y, 6.05, 0.8, [[(rtext, {'size': 9.3, 'color': BODYTX})]], lsp=1.02, sp_after=0)

# ================================================================ 26 · THANK YOU
s = slide()
s.shapes.add_picture(SE_LOGO, Inches(0.5), Inches(0.4), height=Inches(0.72))
s.shapes.add_picture(SEAL, Inches(SW - 1.3), Inches(0.34), height=Inches(0.85))
s.shapes.add_picture(HXLOGO, Inches(SW / 2 - 0.62), Inches(1.5), height=Inches(1.25))
txt(s, 1.0, 3.0, SW - 2.0, 0.9, [[("THANK YOU", {'size': 44, 'bold': True, 'color': NAVY, 'spc': 300})]], align=PP_ALIGN.CENTER, sp_after=0)
rect(s, SW / 2 - 1.6, 3.85, 2.2, 0.05, fill=ACC)
rect(s, SW / 2 + 0.7, 3.85, 0.35, 0.05, fill=VOLT)
txt(s, 1.0, 4.1, SW - 2.0, 0.35, [[K("QUESTIONS & DISCUSSION", size=12, spc=260)]], align=PP_ALIGN.CENTER, sp_after=0)
txt(s, 1.0, 4.75, SW - 2.0, 0.9,
    [[("PRESENTED BY  ", {'size': 10.5, 'color': MUTED, 'spc': 80}), ("NANDHEESA PRASAD K · 192511181", {'size': 12, 'bold': True, 'color': NAVY})],
     [("UNDER THE SUPERVISION OF  ", {'size': 10.5, 'color': MUTED, 'spc': 80}), ("Dr.Surendran R", {'size': 12, 'bold': True, 'color': NAVY})],
     [("SOFTWARE ENGINEERING CAPSTONE · 2026", {'size': 10, 'color': MUTED, 'spc': 120})]],
    align=PP_ALIGN.CENTER, sp_after=6)
txt(s, 1.0, 6.5, SW - 2.0, 0.3, [[K("HARMONIX // ACOUSTIC RESONANCE & NDT INTELLIGENCE", size=9, color=BORDERHI, spc=200)]], align=PP_ALIGN.CENTER, sp_after=0)

prs.core_properties.title = "HARMONIX-AR — Software Engineering Capstone (v2, real UI)"
prs.core_properties.author = "Nandheesa Prasad K (192511181)"
prs.core_properties.subject = "Browser-native Chladni resonance imaging & AI-assisted NDT"
out = os.path.join(ROOT, "..", "HARMONIX-AR_Capstone_Deck.pptx")
prs.save(out)
print("saved", out, "slides:", len(prs.slides._sldIdLst))
