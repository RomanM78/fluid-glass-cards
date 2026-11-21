// Fluid Glass Cards – glass with refraction, elastic surfaces and glass drops for any Home Assistant dashboard
// MIT License, (c) 2026 RomanM78 – https://github.com/RomanM78/fluid-glass-cards
(() => {
const VERSION = "0.1.1";
const UA = navigator.userAgent, REFRACT = /Chrome\/|Chromium\//.test(UA) && !/Firefox\//.test(UA);
const RM = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const TINTS = { none: null, amber: "255,190,90", blue: "110,180,255", violet: "180,140,255", green: "110,220,150", rose: "255,140,190", cyan: "100,230,230", orange: "255,150,90" };
const tintRgb = (t) => (t && TINTS[t] !== undefined ? TINTS[t] : /^\d+\s*,\s*\d+\s*,\s*\d+$/.test(t || "") ? t : null);

// ---------- refraction: an SVG displacement filter per element size, kept in the element's own tree scope
const MAPS = new Map();
function dispMap(w, h, rad, bez) {
  const k = `${w}x${h}x${rad}x${bez}`; if (MAPS.has(k)) return MAPS.get(k);
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"), id = g.createImageData(w, h), d = id.data, hx = w / 2, hy = h / 2, r = Math.min(rad, hx, hy);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const px = x + .5 - hx, py = y + .5 - hy, qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r); let dist, nx, ny;
    if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; dist = l - r; nx = qx / l * Math.sign(px); ny = qy / l * Math.sign(py); } else if (qx > qy) { dist = qx - r; nx = Math.sign(px); ny = 0; } else { dist = qy - r; nx = 0; ny = Math.sign(py); }
    const t = Math.max(0, 1 + dist / bez), m = t * t * (3 - 2 * t) * t, i = (y * w + x) * 4; d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255; }
  g.putImageData(id, 0, 0); const u = c.toDataURL(); MAPS.set(k, u); return u;
}
// root: a ShadowRoot; returns the id of a filter for an element of this size
function filterFor(root, w, h, rad, strength) {
  let defs = root.__fgDefs; if (!defs) { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("width", "0"); s.setAttribute("height", "0"); s.setAttribute("aria-hidden", "true"); s.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"; s.innerHTML = "<defs></defs>"; root.appendChild(s); defs = root.__fgDefs = { el: s.firstChild, ids: new Map() }; }
  if (!defs.el.isConnected) { root.appendChild(defs.el.parentNode); }
  const key = `${w}x${h}x${Math.round(rad)}x${strength}`; let id = defs.ids.get(key); if (id) return id;
  id = "fg" + Math.random().toString(36).slice(2, 8); const small = Math.min(w, h) < 70, bez = small ? Math.min(w, h) * .42 : 26, S = (small ? 30 : 56) * strength, f = document.createElementNS("http://www.w3.org/2000/svg", "filter");
  for (const [k, v] of Object.entries({ id, x: 0, y: 0, width: w, height: h, filterUnits: "userSpaceOnUse", primitiveUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" })) f.setAttribute(k, v);
  const ch = (n, s, mx) => `<feDisplacementMap in="b" in2="m" scale="${s}" xChannelSelector="R" yChannelSelector="G" result="d${n}"/><feColorMatrix in="d${n}" type="matrix" values="${mx}" result="c${n}"/>`;
  f.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="${small ? .6 : 1.4}" result="b"/><feImage href="${dispMap(w, h, rad, bez)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>` + ch("r", S, "1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0") + ch("g", S * 1.1, "0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0") + ch("b", S * 1.2, "0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0") + `<feBlend in="cr" in2="cg" mode="screen" result="rg"/><feBlend in="rg" in2="cb" mode="screen"/>`;
  defs.el.appendChild(f); defs.ids.set(key, id); return id;
}
// applies refraction to el (whose styles live in `root`); falls back to frosted glass
function refract(el, root, opt) {
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight); if (!w || !h) return;
  const k = `${w}x${h}`; if (el.__fgK === k) return; el.__fgK = k;
  const blur = `blur(${opt.blur}px) saturate(1.3)`;
  const v = REFRACT && opt.refraction !== false && w * h < 1200000 ? `url(#${filterFor(root, w, h, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, opt.strength || 1)}) ${blur}` : blur;
  el.style.setProperty("backdrop-filter", v); el.style.setProperty("-webkit-backdrop-filter", blur);
}

// ---------- springs: elastic press for any element, one shared animation loop
const SPR = new Map(); let raf = 0, last = 0;
function loop(t) { raf = 0; const dt = Math.min(.033, last ? (t - last) / 1000 : .016); last = t; let busy = false;
  for (const [el, q] of SPR) { let e = 0; const k = q.soft ? 300 : 420, c = RM() ? 60 : q.soft ? 18 : 13;
    for (let s = 0; s < 2; s++) for (let i = 0; i < 4; i++) { q.d[i] += ((q.t[i] - q.v[i]) * k - q.d[i] * c) * dt / 2; q.v[i] += q.d[i] * dt / 2; }
    for (let i = 0; i < 4; i++) e += (Math.abs(q.t[i] - q.v[i]) + Math.abs(q.d[i]) * .05) * (i < 2 ? 100 : 1);
    if (e < .03 && !q.down) { el.style.transform = ""; SPR.delete(el); } else { busy = true; el.style.transform = `translate(${q.v[2].toFixed(2)}px,${q.v[3].toFixed(2)}px) scale(${(q.v[0] + q.v[1]).toFixed(4)},${(q.v[0] - q.v[1]).toFixed(4)})`; } }
  for (const f of TICK) if (f(dt, t)) busy = true;
  if (busy) raf = requestAnimationFrame(loop); else last = 0; }
const TICK = new Set(); const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
function elastic(el, soft) {
  if (el.__fgEl) return; el.__fgEl = true; el.style.willChange = "transform";
  const st = () => { let q = SPR.get(el); if (!q) { q = { v: [1, 0, 0, 0], d: [0, 0, 0, 0], t: [1, 0, 0, 0], soft }; SPR.set(el, q); } return q; };
  el.addEventListener("pointerdown", (e) => { const q = st(), r = el.getBoundingClientRect(); q.cx = r.left + r.width / 2; q.cy = r.top + r.height / 2; q.down = true; q.t[0] = soft ? .985 : .95; if (!RM()) q.d[1] += soft ? .14 : .45; kick();
    const mv = (ev) => { const m = soft ? 3 : 8, cl = (v) => Math.max(-m, Math.min(m, v)); q.t[2] = cl((ev.clientX - q.cx) * .14); q.t[3] = cl((ev.clientY - q.cy) * .14); };
    const up = () => { q.down = false; q.t = [1, 0, 0, 0]; if (!RM()) q.d[1] -= soft ? .22 : 1.1; kick(); removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up); addEventListener("pointercancel", up); }, { passive: true });
}

// ---------- the picture behind the dashboard (view background), used as texture for the drops
function deepFind(root, sel, depth = 0) { if (!root || depth > 14) return null; const hit = root.querySelector && root.querySelector(sel); if (hit) return hit;
  for (const el of root.querySelectorAll ? root.querySelectorAll("*") : []) if (el.shadowRoot) { const f = deepFind(el.shadowRoot, sel, depth + 1); if (f) return f; } return null; }
function viewBackground() {
  const ha = document.querySelector("home-assistant"); const bg = ha && deepFind(ha.shadowRoot || ha, "hui-view-background");
  const pick = (el) => { if (!el) return null; for (const e of [el, el.shadowRoot && el.shadowRoot.querySelector("*")]) { if (!e) continue; const cs = getComputedStyle(e), m = (cs.backgroundImage || "").match(/url\(["']?([^"')]+)["']?\)/); if (m) return { el: e, url: m[1], fixed: cs.backgroundAttachment === "fixed" }; } return null; };
  return pick(bg) || pick(document.body) || null;
}
const IMGS = new Map();
function loadImg(src, cb) { let e = IMGS.get(src); if (e) { if (e.done) cb(e); else e.cbs.push(cb); return; } e = { im: null, ok: false, done: false, cbs: [cb] }; IMGS.set(src, e);
  const fin = () => { e.done = true; e.cbs.forEach((f) => f(e)); e.cbs = []; }, viaImg = (u, cors) => new Promise((res, rej) => { const im = new Image(); if (cors) im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = rej; im.src = u; });
  fetch(src, { credentials: "same-origin" }).then((r) => { if (!r.ok) throw 0; return r.blob(); }).then((b) => viaImg(URL.createObjectURL(b))).catch(() => viaImg(src, true)).then((im) => { e.im = im; e.ok = true; fin(); }, fin); }
let FALLBACK; function fallbackTex() { if (FALLBACK) return FALLBACK; const c = document.createElement("canvas"); c.width = 640; c.height = 400; const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 320, 400); ["#5f86b5", "#9cb8dc", "#c9b8d8", "#e7b8a6"].forEach((p, i) => gr.addColorStop(i / 3, p)); g.fillStyle = gr; g.fillRect(0, 0, 640, 400);
  g.strokeStyle = "rgba(255,255,255,.35)"; for (let i = 1; i < 30; i++) { g.beginPath(); g.arc(160, 130, i * 18, 0, 7); g.stroke(); } return (FALLBACK = c); }

const BASE = `:host{display:block}*{box-sizing:border-box}`;
const GLASS = (r, a) => `background:linear-gradient(160deg,rgba(255,255,255,${.2 * a}),rgba(255,255,255,${.05 * a}) 55%,rgba(255,255,255,${.11 * a}));box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 0 0 1px rgba(255,255,255,.2),inset 0 -1px 0 rgba(255,255,255,.12),0 18px 40px -18px rgba(0,10,40,.45);border-radius:${r}px`;

async function helpers() { return window.loadCardHelpers ? window.loadCardHelpers() : null; }

// ============ fluid-glass-card: a glass frame around any cards
class FluidGlassCard extends HTMLElement {
  setConfig(c) { if (!c || !Array.isArray(c.cards)) throw new Error("fluid-glass-card: 'cards' list is required"); this._c = Object.assign({ radius: 28, padding: 12, gap: 10, blur: 14, layout: "vertical", columns: 2, refraction: true, press: true, inner: "glass", strength: 1 }, c); this._build(); }
  set hass(h) { this._h = h; (this._kids || []).forEach((k) => (k.hass = h)); }
  getCardSize() { return (this._kids || []).reduce((s, k) => s + (k.getCardSize ? k.getCardSize() || 1 : 1), 0) || 2; }
  async _build() {
    const c = this._c, R = this.shadowRoot || this.attachShadow({ mode: "open" }), tint = tintRgb(c.tint);
    const lay = c.layout === "horizontal" ? `display:flex;gap:${c.gap}px` : c.layout === "grid" ? `display:grid;grid-template-columns:repeat(${c.columns},minmax(0,1fr));gap:${c.gap}px` : `display:flex;flex-direction:column;gap:${c.gap}px`;
    R.innerHTML = `<style>${BASE}
.f{position:relative;isolation:isolate;border-radius:${c.radius}px;padding:${c.padding}px}
.l{position:absolute;inset:0;z-index:-1;pointer-events:none;${GLASS(c.radius, 1)};-webkit-backdrop-filter:blur(${c.blur}px) saturate(1.3);backdrop-filter:blur(${c.blur}px) saturate(1.3)${tint ? `;background-color:rgba(${tint},.18)` : ""}}
.t{font:600 15px/1.2 var(--paper-font-body1_-_font-family,system-ui);color:var(--primary-text-color);padding:4px 6px 10px;text-shadow:0 1px 8px rgba(0,10,30,.25)}
.c{${lay}}.c>*{flex:1 1 0;min-width:0}
.c{--ha-card-background:${c.inner === "clear" ? "transparent" : "rgba(255,255,255,.12)"};--ha-card-box-shadow:${c.inner === "clear" ? "none" : "inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 0 1px rgba(255,255,255,.18)"};--ha-card-border-width:0;--ha-card-border-color:transparent;--ha-card-backdrop-filter:${c.inner === "clear" ? "none" : `blur(${Math.round(c.blur * .6)}px) saturate(1.2)`};--ha-card-border-radius:${Math.max(8, c.radius - c.padding)}px}
</style><div class="f">${c.title ? `<div class="t">${String(c.title).replace(/[<&]/g, "")}</div>` : ""}<i class="l"></i><div class="c"></div></div>`;
    const box = R.querySelector(".c"), H = await helpers(); this._kids = [];
    for (const cc of c.cards) { let el; try { el = H ? await H.createCardElement(cc) : document.createElement("div"); } catch (e) { el = document.createElement("div"); el.textContent = e.message; } if (this._h) el.hass = this._h; if (c.press !== false) elastic(el, false); box.appendChild(el); this._kids.push(el); }
    if (c.press !== false) elastic(R.querySelector(".f"), true);
    const lyr = R.querySelector(".l"), go = () => refract(lyr, R, c); this._ro && this._ro.disconnect(); this._ro = new ResizeObserver(go); this._ro.observe(lyr); requestAnimationFrame(go);
  }
  static getStubConfig() { return { cards: [{ type: "tile", entity: "sun.sun" }] }; }
}

// ============ fluid-glass-drop-card: draggable glass drops that show an entity value
const FRAG = `precision highp float;varying vec2 v;uniform sampler2D T;uniform vec4 R;uniform vec4 V;uniform vec4 K;uniform float t;uniform vec4 D[2];uniform vec4 E[2];
float fld(vec2 p,out float re){float F=0.;float wr=0.;for(int i=0;i<2;i++){if(D[i].z<=0.)continue;vec2 q=p-D[i].xy;vec2 e=E[i].xy;q=vec2(q.x*e.x+q.y*e.y,-q.x*e.y+q.y*e.x);q.x/=E[i].z;q.y*=E[i].z;float an=atan(q.y,q.x);float rad=D[i].z*(1.+D[i].w*cos(2.*an)*sin(E[i].w)+.5*D[i].w*cos(3.*an+1.)*sin(E[i].w*1.6)+.012*sin(an*3.+t*.8+float(i)*2.));float d=length(q)/rad;float f=1./(d*d*d*d+1e-4);F+=f;wr+=f*D[i].z;}re=wr/max(F,1e-6);return F;}
float hgt(float F){return sqrt(max(0.,1.-inversesqrt(F)));}
vec3 smp(vec3 N,float ior,vec2 css,float re){vec3 r=refract(vec3(0.,0.,-1.),N,1./ior);return texture2D(T,clamp((css+r.xy*re*.8-V.xy)/V.zw,0.,1.)).rgb;}
void main(){vec2 l=vec2(v.x,1.-v.y)*R.zw;float re;float F=fld(l,re);float a=smoothstep(1.,1.12,F);if(a<=0.){gl_FragColor=vec4(0.);return;}
float z=hgt(F);float r2;float zx=hgt(fld(l+vec2(1.,0.),r2));float zy=hgt(fld(l+vec2(0.,1.),r2));vec3 N=normalize(vec3(-(zx-z)*re,-(zy-z)*re,1.));
vec2 css=R.xy+l;vec3 c=vec3(smp(N,1.38,css,re).r,smp(N,1.5,css,re).g,smp(N,1.64,css,re).b);c=mix(c,K.rgb,K.a);
float f=pow(1.-N.z,2.2);c=mix(c,c*vec3(.72,1.,.96),.22);c+=f*.3*(.5+.5*cos(6.2832*(f*1.4+vec3(0.,.33,.67))+t*.6));c=mix(c,vec3(.86,.95,1.),f*.38);
vec3 M=vec3(N.x,-N.y,N.z);vec3 L=normalize(vec3(-.55,.65,.55));float s=pow(max(dot(reflect(-L,M),vec3(0.,0.,1.)),0.),48.);float s2=pow(max(dot(reflect(-normalize(vec3(.6,-.5,.5)),M),vec3(0.,0.,1.)),0.),20.);c+=s*.95+s2*.18;c=c*(.96+.1*M.y)*1.12+.03;
gl_FragColor=vec4(c*a,a);}`;
class FluidGlassDropCard extends HTMLElement {
  setConfig(c) { this._c = Object.assign({ size: 110, height: 0, second: true, decimals: null, tint: "none" }, c || {}); this._build(); }
  set hass(h) { this._h = h; this._label(); }
  getCardSize() { return Math.ceil((this._c.height || this._c.size * 1.7) / 50); }
  getGridOptions() { return { rows: Math.ceil((this._c.height || this._c.size * 1.7) / 56), columns: 6, min_rows: 2 }; }
  _build() {
    const c = this._c, R = this.shadowRoot || this.attachShadow({ mode: "open" }), H = c.height || Math.round(c.size * 1.7);
    R.innerHTML = `<style>${BASE}.w{position:relative;height:${H}px;touch-action:pan-y}canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.h{position:absolute;left:0;top:0;border-radius:50%;cursor:grab;touch-action:none;display:grid;place-content:center;text-align:center;color:#fff;text-shadow:0 2px 14px rgba(0,10,30,.6);-webkit-user-select:none;user-select:none;font-family:var(--paper-font-body1_-_font-family,system-ui)}
.h b{font-size:${Math.round(c.size * .24)}px;font-weight:300;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1}.h small{font-size:${Math.max(10, Math.round(c.size * .1))}px;font-weight:600;opacity:.9;margin-top:3px}.h:focus-visible{outline:2px solid #fff;outline-offset:2px}</style>
<div class="w"><canvas></canvas><div class="h" tabindex="0" role="button"></div><div class="h" tabindex="-1" aria-hidden="true"></div></div>`;
    const w = R.querySelector(".w"), cv = R.querySelector("canvas"), gl = cv.getContext("webgl", { premultipliedAlpha: true, antialias: true });
    const D = this._D = { w, cv, gl, drops: [...R.querySelectorAll(".h")].map((el, i) => ({ el, i, x: 0, y: 0, vx: 0, vy: 0, r: 0, s: 1, ca: 1, sa: 0, amp: 0, ph: 0, drag: null, init: false })) };
    if (!c.second) D.drops[1].el.style.display = "none";
    if (gl) { const sh = (ty, src) => { const o = gl.createShader(ty); gl.shaderSource(o, src); gl.compileShader(o); return o; }, p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, "attribute vec2 a;varying vec2 v;void main(){v=a*.5+.5;gl_Position=vec4(a,0.,1.);}")); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(p); gl.useProgram(p);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); const loc = gl.getAttribLocation(p, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      D.U = {}; for (const k of ["T", "R", "V", "K", "t", "D", "E"]) D.U[k] = gl.getUniformLocation(p, k); D.tex = gl.createTexture(); D.tk = ""; }
    const bump = (d, a) => { d.amp = Math.min(.22, d.amp + a); };
    D.drops.forEach((d) => { const h = d.el;
      h.addEventListener("pointerdown", (e) => { const r = w.getBoundingClientRect(); d.drag = { ox: e.clientX - r.left - d.x, oy: e.clientY - r.top - d.y, moved: 0, tx: d.x, ty: d.y }; h.setPointerCapture(e.pointerId); bump(d, .07); this._run(); e.preventDefault(); });
      h.addEventListener("pointermove", (e) => { if (!d.drag) return; const r = w.getBoundingClientRect(), nx = e.clientX - r.left - d.drag.ox, ny = e.clientY - r.top - d.drag.oy; d.drag.moved += Math.abs(nx - d.drag.tx) + Math.abs(ny - d.drag.ty); d.drag.tx = nx; d.drag.ty = ny; });
      const up = () => { if (!d.drag) return; const tap = d.drag.moved < 6; bump(d, tap ? .14 : .06); d.drag = null; this._run(); if (tap && d.i === 0 && c.entity && c.tap_action !== "none") this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: c.entity } })); };
      h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
      h.addEventListener("keydown", (e) => { const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (k) { d.vx += k[0] * 500; d.vy += k[1] * 500; bump(d, .06); e.preventDefault(); this._run(); } });
    });
    this._label(); this._ro && this._ro.disconnect(); this._ro = new ResizeObserver(() => { this._home(); this._run(); }); this._ro.observe(w);
  }
  _label() { const c = this._c, D = this._D; if (!D) return; const h = D.drops[0].el; let b = c.text || "", sm = c.name || "";
    if (c.entity && this._h) { const s = this._h.states[c.entity]; if (s) { const n = Number(s.state); b = Number.isFinite(n) ? (c.decimals != null ? n.toFixed(c.decimals) : String(Math.round(n * 10) / 10)) : (this._h.formatEntityState ? this._h.formatEntityState(s) : s.state); const u = c.unit != null ? c.unit : Number.isFinite(n) ? s.attributes.unit_of_measurement || "" : ""; if (u) b += (u === "%" || u === "°C" || u === "°F" ? "" : " ") + u; if (!sm) sm = s.attributes.friendly_name || ""; } }
    const html = `<b>${String(b).replace(/[<&]/g, "")}</b>${sm ? `<small>${String(sm).replace(/[<&]/g, "")}</small>` : ""}`; if (h.__l !== html) { h.innerHTML = html; h.__l = html; h.setAttribute("aria-label", `${sm} ${b}`); } }
  _home() { const D = this._D, W = D.w.clientWidth, H = D.w.clientHeight; if (!W || !H) return; const c = this._c, a = D.drops[0], b = D.drops[1];
    a.r = Math.min(c.size / 2, H / 2 - 6, W / 2 - 6); b.r = c.second ? a.r * .45 : 0; const hx = c.align === "left" ? a.r + 10 : c.align === "right" ? W - a.r * 2.2 - 10 : W / 2 - (b.r ? a.r * .45 : 0);
    for (const [d, x, y] of [[a, hx, H / 2], [b, hx + a.r * 1.5, H / 2 + a.r * .55]]) { if (!d.r) continue; if (!d.init || D.W !== W) { d.x = Math.max(d.r, Math.min(W - d.r, x)); d.y = Math.max(d.r, Math.min(H - d.r, y)); d.init = true; } d.el.style.width = d.el.style.height = d.r * 2 + "px"; }
    D.W = W; D.H = H; }
  _run() { if (!this._tick) { this._tick = (dt, t) => this._step(dt, t); } TICK.add(this._tick); kick(); }
  connectedCallback() { this._run(); }
  disconnectedCallback() { TICK.delete(this._tick); }
  _src() { const c = this._c; if (c.image) return { url: c.image, el: null, fixed: true };
    if (!this._vb || performance.now() - (this._vbt || 0) > 4000) { this._vb = viewBackground(); this._vbt = performance.now(); } return this._vb; }
  _step(dt, ms) {
    const D = this._D; if (!D || !this.isConnected) return false; const W = D.W || 0, H = D.H || 0; if (!W) { this._home(); return true; }
    const ds = D.drops.filter((d) => d.r > 0); let moving = false;
    for (let s = 0; s < 2; s++) { const h = dt / 2;
      for (const d of ds) { if (d.drag) { d.vx += ((d.drag.tx - d.x) * 260 - d.vx * 22) * h; d.vy += ((d.drag.ty - d.y) * 260 - d.vy * 22) * h; } else { d.vx -= d.vx * 3.2 * h; d.vy -= d.vy * 3.2 * h; }
        d.x += d.vx * h; d.y += d.vy * h; const m = d.r * .9;
        for (const [ax, lo, hi] of [["x", m, W - m], ["y", m, H - m]]) { const v = "v" + ax; if (d[ax] < lo) { d[ax] = lo; if (d[v] < 0) { d.amp = Math.min(.14, d.amp - d[v] / 3000); d[v] *= -.45; } } else if (d[ax] > hi) { d[ax] = hi; if (d[v] > 0) { d.amp = Math.min(.14, d.amp + d[v] / 3000); d[v] *= -.45; } } }
        const sp = Math.hypot(d.vx, d.vy), ts = 1 + Math.min(.32, sp / 1500); d.s += (ts - d.s) * Math.min(1, h * 14); if (sp > 20) { const q = Math.min(1, h * 16); d.ca += (d.vx / sp - d.ca) * q; d.sa += (d.vy / sp - d.sa) * q; const nn = Math.hypot(d.ca, d.sa) || 1; d.ca /= nn; d.sa /= nn; }
        d.amp *= Math.exp(-2.6 * h); d.ph += h * 15; if (sp > 4 || d.amp > .004 || d.drag || Math.abs(d.s - 1) > .002) moving = true; } }
    if (ds.length === 2) { const near = Math.hypot(ds[0].x - ds[1].x, ds[0].y - ds[1].y) < (ds[0].r + ds[1].r) * 1.15; if (near !== !!D.near) { D.near = near; ds.forEach((d) => (d.amp = Math.min(.22, d.amp + .06))); moving = true; } }
    for (const d of ds) d.el.style.transform = `translate(${(d.x - d.r).toFixed(1)}px,${(d.y - d.r).toFixed(1)}px)`;
    const gl = D.gl; if (gl) { const r = D.cv.getBoundingClientRect(), pr = Math.min(2, devicePixelRatio || 1), w = Math.round(r.width * pr), hh = Math.round(r.height * pr); if (D.cv.width !== w || D.cv.height !== hh) { D.cv.width = w; D.cv.height = hh; }
      const S = this._src(); let src = fallbackTex(), tk = "fb", TR = [r.left, r.top, r.width, r.height];
      if (S && S.url) { const e = IMGS.get(S.url); if (!e) loadImg(S.url, () => this._run()); else if (e.ok) { const im = e.im, br = S.fixed || !S.el ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : S.el.getBoundingClientRect(), s = Math.max(br.width / im.naturalWidth, br.height / im.naturalHeight), dw = im.naturalWidth * s, dh = im.naturalHeight * s; src = im; tk = S.url; TR = [br.left + (br.width - dw) / 2, br.top + (br.height - dh) / 2, dw, dh]; } }
      if (D.tk !== tk) { gl.bindTexture(gl.TEXTURE_2D, D.tex); try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); D.tk = tk; } catch (e) { D.tk = tk; } for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); }
      const tint = tintRgb(this._c.tint), K = tint ? tint.split(",").map((x) => x / 255).concat(.22) : [0, 0, 0, 0];
      if (w && hh) { const U = D.U; gl.viewport(0, 0, w, hh); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.uniform1i(U.T, 0); gl.uniform4f(U.R, r.left, r.top, r.width, r.height); gl.uniform4f(U.V, TR[0], TR[1], TR[2], TR[3]); gl.uniform4f(U.K, K[0], K[1], K[2], K[3]); gl.uniform1f(U.t, ms / 1000);
        const DD = [], EE = []; for (const q of D.drops) { DD.push(q.x, q.y, q.r, q.amp); EE.push(q.ca, q.sa, q.s, q.ph); } gl.uniform4fv(U.D, DD); gl.uniform4fv(U.E, EE); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); } }
    // keep redrawing slowly while the page scrolls so the refraction follows the picture
    const y = D.cv.getBoundingClientRect().top; if (y !== D.ly) { D.ly = y; moving = true; }
    if (!moving) TICK.delete(this._tick); return moving;
  }
  static getStubConfig() { return { entity: "sun.sun" }; }
}

// ============ fluid-glass-nav-card: glass bar with a sliding drop behind the active entry
class FluidGlassNavCard extends HTMLElement {
  setConfig(c) { if (!c || !Array.isArray(c.items) || !c.items.length) throw new Error("fluid-glass-nav-card: 'items' list is required"); this._c = Object.assign({ position: "inline", blur: 16, refraction: true }, c); this._build(); }
  set hass(h) { this._h = h; }
  getCardSize() { return 1; }
  connectedCallback() { this._loc = () => this._mark(); addEventListener("location-changed", this._loc); addEventListener("popstate", this._loc); this._mark(); }
  disconnectedCallback() { removeEventListener("location-changed", this._loc); removeEventListener("popstate", this._loc); TICK.delete(this._tick); }
  _build() {
    const c = this._c, R = this.shadowRoot || this.attachShadow({ mode: "open" }), fixed = c.position === "bottom";
    R.innerHTML = `<style>${BASE}
.b{position:${fixed ? "fixed" : "relative"};${fixed ? "left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:5;width:min(560px,calc(100vw - 28px))" : ""};isolation:isolate;border-radius:999px;padding:6px;display:flex;gap:4px}
.l{position:absolute;inset:0;z-index:-2;border-radius:999px;pointer-events:none;${GLASS(999, 1)};-webkit-backdrop-filter:blur(${c.blur}px) saturate(1.3);backdrop-filter:blur(${c.blur}px) saturate(1.3)}
.i{position:absolute;left:0;top:6px;z-index:-1;border-radius:999px;pointer-events:none;background:linear-gradient(160deg,rgba(255,255,255,.6),rgba(255,255,255,.3));box-shadow:0 10px 24px -10px rgba(10,30,70,.45),inset 0 1px 0 rgba(255,255,255,.9),inset 0 0 0 1px rgba(255,255,255,.5);opacity:0}
a{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border-radius:999px;color:var(--primary-text-color);text-decoration:none;font:500 12px/1.2 var(--paper-font-body1_-_font-family,system-ui);-webkit-tap-highlight-color:transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
a.on{color:var(--fg-nav-active,var(--primary-color))}a:focus-visible{outline:2px solid var(--primary-color);outline-offset:-2px}
ha-icon{--mdc-icon-size:22px}</style>
<nav class="b"><i class="l"></i><i class="i"></i>${c.items.map((it, n) => `<a href="${String(it.path || "#").replace(/"/g, "")}" data-n="${n}">${it.icon ? `<ha-icon icon="${String(it.icon).replace(/"/g, "")}"></ha-icon>` : ""}${it.name ? `<span>${String(it.name).replace(/[<&]/g, "")}</span>` : ""}</a>`).join("")}</nav>`;
    R.querySelectorAll("a").forEach((a) => { elastic(a, false); a.addEventListener("click", (e) => { const p = a.getAttribute("href"); if (!p || /^https?:/.test(p)) return; e.preventDefault(); history.pushState(null, "", p); dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } })); this._mark(); }); });
    const lyr = R.querySelector(".l"), go = () => refract(lyr, R, c); this._ro && this._ro.disconnect(); this._ro = new ResizeObserver(() => { go(); this._mark(); }); this._ro.observe(lyr); requestAnimationFrame(go); this._mark();
  }
  _mark() { const R = this.shadowRoot; if (!R) return; const p = location.pathname; let best = -1, bl = -1;
    this._c.items.forEach((it, n) => { const q = String(it.path || ""); if (q && (p === q || p.startsWith(q.replace(/\/$/, "") + "/")) && q.length > bl) { best = n; bl = q.length; } });
    R.querySelectorAll("a").forEach((a) => a.classList.toggle("on", +a.dataset.n === best)); this._best = best;
    if (!this._tick) this._tick = (dt) => this._slide(dt); TICK.add(this._tick); kick(); }
  _slide(dt) { const R = this.shadowRoot, ind = R && R.querySelector(".i"), on = R && R.querySelector("a.on"); if (!ind) return false; if (!on) { ind.style.opacity = 0; return false; } ind.style.opacity = 1;
    const tx = on.offsetLeft, tw = on.offsetWidth, th = on.offsetHeight, N = this._N || (this._N = { x: tx, v: 0, w: tw }); const c = RM() ? 40 : 15; N.v += ((tx - N.x) * 230 - N.v * c) * dt; N.x += N.v * dt; N.w += (tw - N.w) * Math.min(1, dt * 12);
    const st = Math.min(.5, Math.abs(N.v) / 1200); ind.style.width = N.w + "px"; ind.style.height = th + "px"; ind.style.transform = `translate(${(N.x - N.w * st * .5).toFixed(2)}px,0) scale(${(1 + st).toFixed(4)},${(1 - st * .25).toFixed(4)})`;
    return Math.abs(tx - N.x) > .3 || Math.abs(N.v) > .5; }
  static getStubConfig() { return { items: [{ name: "Home", icon: "mdi:home", path: "/lovelace/0" }] }; }
}

// ============ fluid-glass-view: turns every card of the view into glass (invisible helper card)
class FluidGlassView extends HTMLElement {
  setConfig(c) { this._c = Object.assign({ blur: 14, refraction: true, press: true, radius: null, tint: "none", strength: 1 }, c || {}); }
  set hass(h) { this._h = h; }
  getCardSize() { return 0; }
  getGridOptions() { return { rows: 0, columns: 0 }; }
  connectedCallback() { this.style.display = "none"; this._iv = setInterval(() => this._apply(), 1500); setTimeout(() => this._apply(), 300); }
  disconnectedCallback() { clearInterval(this._iv); }
  _view() { let n = this; for (let i = 0; i < 40 && n; i++) { const r = n.getRootNode(); n = n.parentNode || (r && r.host); if (n && n.tagName && /^HUI-(SECTIONS|MASONRY|PANEL|SIDEBAR)-VIEW$|^HUI-VIEW$/.test(n.tagName)) return n; } return null; }
  _apply() {
    const c = this._c, v = this._view() || document.querySelector("hui-view, hui-sections-view, hui-masonry-view") || document.body; if (!v) return; const tint = tintRgb(c.tint);
    if (c.background_image) { const bg = deepFind(document.querySelector("home-assistant") && document.querySelector("home-assistant").shadowRoot, "hui-view-background"); const t = bg || v; t.style.backgroundImage = `url("${c.background_image}")`; t.style.backgroundSize = "cover"; t.style.backgroundPosition = "center"; t.style.backgroundAttachment = "fixed"; }
    const cards = []; const walk = (root, d) => { if (!root || d > 10) return; for (const el of root.querySelectorAll("*")) { if (el.tagName === "HA-CARD") cards.push(el); if (el.shadowRoot && el !== this) walk(el.shadowRoot, d + 1); } }; walk(v.shadowRoot || v, 0);
    for (const card of cards) { const R = card.shadowRoot; if (!R) continue; if (card.closest && card.closest("fluid-glass-card")) continue;
      const owner = card.getRootNode() && card.getRootNode().host; if (owner && /^HUI-(HEADING|MARKDOWN)-CARD$/.test(owner.tagName) && !c.include_headings) continue;
      let st = R.__fgSt; if (!st) { st = R.__fgSt = document.createElement("style"); R.appendChild(st); if (c.press !== false) elastic(card, true); }
      const w = Math.round(card.offsetWidth), h = Math.round(card.offsetHeight); if (!w || !h) continue; const rad = c.radius != null ? c.radius : parseFloat(getComputedStyle(card).borderTopLeftRadius) || 12;
      const blur = `blur(${c.blur}px) saturate(1.3)`, f = REFRACT && c.refraction !== false && w * h < 1200000 ? `url(#${filterFor(R, w, h, rad, c.strength)}) ${blur}` : blur;
      const css = `:host{${GLASS(rad, 1).split(";").map((d) => d + "!important").join(";")};${tint ? `background-color:rgba(${tint},.16)!important;` : ""}border:0!important;-webkit-backdrop-filter:${blur}!important;backdrop-filter:${f}!important}`; if (st.textContent !== css) st.textContent = css; }
  }
}

const reg = (n, C, name, desc) => { if (!customElements.get(n)) customElements.define(n, C); window.customCards = window.customCards || []; if (!window.customCards.some((x) => x.type === n)) window.customCards.push({ type: n, name, description: desc, preview: false, documentationURL: "https://github.com/RomanM78/fluid-glass-cards" }); };
reg("fluid-glass-card", FluidGlassCard, "Fluid Glass – frame", "Glass frame with refraction around any cards");
reg("fluid-glass-drop-card", FluidGlassDropCard, "Fluid Glass – drop", "Draggable glass drops that show an entity value");
reg("fluid-glass-nav-card", FluidGlassNavCard, "Fluid Glass – navigation", "Glass navigation bar with a sliding drop");
reg("fluid-glass-view", FluidGlassView, "Fluid Glass – whole view", "Turns every card of this view into glass");
console.info(`%c FLUID-GLASS-CARDS %c ${VERSION} `, "background:#7ab8ff;color:#002;font-weight:700", "background:#e8f2ff;color:#002");
})();
