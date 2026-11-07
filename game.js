// 百人一首あわせ：読み札（上の句・決まり字）に合う取り札（下の句）を選ぶ。歌は data.js（小倉百人一首の100首）。
// 決まり字は、上の句を読む音で比べて「ほかの歌と分かれるまでの字数」をここで数える（手で書いた決まり字は無い）。
(function (root) {
  "use strict";
  const UTA = root.HYAKUNIN_UTA || (typeof require === "function" ? require("./data.js") : null);
  const LV = ["やさしい", "ふつう", "むずかしい"];
  // 練習の組（歌番号で20首ずつ）
  const AREAS = ["1〜20番", "21〜40番", "41〜60番", "61〜80番", "81〜100番"];

  // 読む音：歴史的仮名づかいを、読み上げるときの音にそろえる（を→お、ゐ→い、ゑ→え、ぢ→じ、づ→ず、句のはじめ以外のは行→わ行）。1字は1字のまま
  const M = { ゐ: "い", ゑ: "え", を: "お", ぢ: "じ", づ: "ず" }, H = { は: "わ", ひ: "い", ふ: "う", へ: "え", ほ: "お" };
  const sound = (kana) => kana.split(" ").map((ph) => { const t = [...ph].map((c) => M[c] || c).join(""); return t[0] + [...t.slice(1)].map((c) => H[c] || c).join(""); }).join("");

  const POEMS = UTA.map((u, i) => ({ no: i + 1, au: u[0], auk: u[1], up: u[2], lo: u[3], uh: u[4], lh: u[5], snd: sound(u[4]) }));
  for (const p of POEMS) {
    let n = 1; while (POEMS.some((q) => q !== p && q.snd.slice(0, n) === p.snd.slice(0, n))) n++;
    p.kn = n; p.kima = p.uh.replace(/ /g, "").slice(0, n); // 決まり字（札に書かれた字のまま）
    p.tomo = n > 1 ? POEMS.filter((q) => q !== p && q.snd.slice(0, n - 1) === p.snd.slice(0, n - 1)).map((q) => q.no) : []; // 友札：決まり字の1つ前まで同じ歌
  }
  const BY = {}; for (const p of POEMS) BY[p.no] = p;
  const IDS = POEMS.map((p) => p.no);

  // ---- 種から決まる乱数（だれでも同じ問題）----
  function seedOf(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffled(arr, R) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ---- 問題：1首ずつ、3つの難しさ ----
  // やさしい（u）：上の句を全部読む → 下の句の札を4枚から
  // ふつう（k）：決まり字だけ読む → 下の句の札を4枚から（ほかの3枚は、はじめの字がちがう歌）
  // むずかしい（t）：決まり字だけ読む → 友札（途中まで同じ音の歌）をまぜた4枚から（2字決まり以上の歌）
  const KIND = ["u", "k", "t"];
  const QS = [], QBY = {}, POOL = [[], [], []];
  for (let lv = 0; lv < 3; lv++) for (const p of POEMS) {
    if (lv === 2 && p.kn < 2) continue;
    const id = KIND[lv] + p.no, q = { id, lv, no: p.no }; QS.push(q); QBY[id] = q; POOL[lv].push(id);
  }
  // 選び肢の札（4枚）：問題の id から決まる（だれでも同じ）
  function optsOf(id) {
    const q = QBY[id], p = BY[q.no], R = rng(seedOf("opt:" + id)), others = POEMS.filter((x) => x !== p);
    let pick;
    if (q.lv === 2) {
      // 友札 → はじめの音が同じ歌（近い順）→ そのほか
      const near = (x) => { let n = 0; while (n < x.snd.length && x.snd[n] === p.snd[n]) n++; return n; };
      const byNear = shuffled(others, R).sort((a, b) => near(b) - near(a));
      pick = byNear.slice(0, 3);
    } else if (q.lv === 1) pick = shuffled(others.filter((x) => x.snd[0] !== p.snd[0]), R).slice(0, 3);
    else pick = shuffled(others, R).slice(0, 3);
    return shuffled([p.no, ...pick.map((x) => x.no)], R);
  }
  // 1問：tag は「難しさ:問題の id|モードと日付…」
  function make(tag) {
    const m = String(tag).match(/^([012]):([a-z0-9]+)\|/); if (!m || !QBY[m[2]]) throw new Error("知らない問題 " + tag);
    const q = QBY[m[2]], opts = optsOf(q.id);
    return { tag, lv: q.lv, id: q.id, p: BY[q.no], opts: opts.map((n) => BY[n]), ans: opts.indexOf(q.no) };
  }
  // 答えのあとに出す説明（決まり字の分かれ目）
  function facts(P) {
    const p = P.p, out = [`${p.no}番　${p.au}（${p.auk}）`];
    if (p.kn === 1) out.push(`「${p.kima}」で始まる歌は、この1首だけ。最初の1字で取れる（1字決まり）。`);
    else {
      const t = p.tomo.map((n) => BY[n]);
      out.push(`「${p.kima.slice(0, -1)}」までは ${t.length + 1}首が同じ音。${p.kn}字目の「${p.kima.slice(-1)}」で分かれる（${p.kn}字決まり）。`);
      // 同じ音の歌が多いとき（「あ」で始まる16首など）は、数だけ言う（一画面一問）
      out.push(t.length <= 4 ? "同じ音の歌：" + t.map((x) => `${x.no}番「${x.kima}…」`).join("・") : `同じ音の歌はほかに${t.length}首。決まり字まで聞けば1首に決まる。`);
    }
    return out;
  }

  // ---- 今日の5問・上級（日本時間の日付から。だれでも同じ）----
  const DAY = 864e5, EPOCH = "2026-11-07";
  const dayMs = (k) => Date.parse(k + "T00:00:00Z");
  const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  const dayIdx = (k) => Math.max(0, Math.round((dayMs(k) - dayMs(EPOCH)) / DAY));
  const CYC = {};
  function cycle(name, lv, c) {
    const key = name + lv + ":" + c; if (CYC[key]) return CYC[key];
    let a = shuffled(POOL[lv], rng(seedOf(name + ":" + lv + ":" + c)));
    // 前の周の後ろ半分は、次の周の後ろ半分へ回す（周のつなぎ目で同じ問題がすぐ戻らない）
    if (c > 0) { const prev = cycle(name, lv, c - 1), tail = new Set(prev.slice(-Math.floor(prev.length / 2))); a = [...a.filter((id) => !tail.has(id)), ...a.filter((id) => tail.has(id))]; }
    return (CYC[key] = a);
  }
  const nth = (name, lv, idx) => cycle(name, lv, Math.floor(idx / POOL[lv].length))[idx % POOL[lv].length];
  const LVS = [0, 0, 1, 1, 2];
  // その日のほかの問題と、歌が重ならない問題を選ぶ（重なる問題は次の日へ回す）。並びの問題は一度ずつ使う
  const evOf = (id) => [QBY[id].no];
  const SIM = {};
  function simDay(name, lvs, i, avoidOf) {
    const S = SIM[name] || (SIM[name] = { days: [], ptr: [0, 0, 0], wait: [[], [], []] });
    while (S.days.length <= i) {
      const d = S.days.length, used = new Set(avoidOf ? avoidOf(d).flatMap(evOf) : []), out = [];
      const free = (id) => evOf(id).every((e) => !used.has(e));
      for (const lv of lvs) {
        const w = S.wait[lv], wi = w.findIndex(free);
        let id = wi >= 0 ? w.splice(wi, 1)[0] : null;
        for (let g = 0; id == null; g++) { if (g > 4 * POOL[lv].length) throw new Error("問題を選べない"); const x = nth(name, lv, S.ptr[lv]++); if (free(x)) id = x; else w.push(x); }
        for (const e of evOf(id)) used.add(e); out.push([lv, id]);
      }
      S.days.push(out);
    }
    return S.days[i];
  }
  const dayPick = (i) => simDay("day", LVS, i);
  const hardPick = (i) => simDay("hard", [2, 2, 2], i, (d) => dayPick(d).map((o) => o[1]));
  const dailyTags = (k) => dayPick(dayIdx(k)).map(([lv, id]) => `${lv}:${id}|d${k}`);
  const hardTags = (k) => hardPick(dayIdx(k)).map(([lv, id]) => `${lv}:${id}|h${k}`);

  const API = { LV, AREAS, POEMS, BY, IDS, QS, QBY, POOL, KIND, sound, optsOf, make, facts, seedOf, rng, shuffled, dailyTags, hardTags, dayIdx, EPOCH, dayMs, keyOf, evOf };
  if (typeof module === "object" && module.exports) module.exports = API;
  root.HYAKUNIN = API;
})(typeof window !== "undefined" ? window : globalThis);
