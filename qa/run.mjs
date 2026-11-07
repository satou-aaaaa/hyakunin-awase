// 百人一首あわせの検査。歌のデータ（100首・5-7-5-7-7・番号・重なり）・決まり字（別の数え方で数え直す・1字決まり「むすめふさほせ」・6字決まりの3組）・
// 問題（選び肢の札・友札・答え）・今日の5問と上級の組み方（3年分）・通しで遊ぶ・まちがい・ヒント・続きから・上級・練習・とことん・歌の帳・実績・
// カレンダー・あとから・古いタブ・スマホ幅・PWA・引き継ぎコード・見やすさを確かめる。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";
import { checkSwStall } from "./sw-check.mjs";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 400) });
const req = createRequire(import.meta.url);
const UTA = req(path.join(root, "data.js"));
const G = req(path.join(root, "game.js"));
const idOf = (t) => t.split("|")[0].split(":")[1];

// ---- 1. 歌のデータと決まり字（ブラウザを使わない）----
{
  const tsv = readFileSync(path.join(root, "tools/uta.tsv"), "utf8").trim().split("\n").map((l) => l.split("\t"));
  check("data.js は tools/uta.tsv から作ったまま（手で直していない）", UTA.length === 100 && tsv.every((r, i) => +r[0] === i + 1 && JSON.stringify(r.slice(1, 7)) === JSON.stringify(UTA[i])));
  // かなの音の数：小さい「ゃゅょ」は前の字と合わせて1つ。5・7・5・7・7（字余りは1つまで）
  const mora = (s) => [...s].filter((c) => !"ゃゅょ".includes(c)).length, bad = [];
  UTA.forEach((u, i) => {
    const ph = [...u[4].split(" "), ...u[5].split(" ")], m = ph.map(mora), want = [5, 7, 5, 7, 7];
    if (ph.length !== 5 || m.some((x, j) => x < want[j] || x > want[j] + 1)) bad.push(`${i + 1}:${m}`);
    if (!/^[ぁ-ゖー ]+$/.test(u[4] + u[5])) bad.push(`${i + 1}:かな以外`);
    if (!u[0] || !u[1] || !u[2] || !u[3] || !/^[ぁ-ゖー]+$/.test(u[1])) bad.push(`${i + 1}:空`);
  });
  check("100首とも、上の句は5・7・5、下の句は7・7の音（字余りは1つまで）・かなはひらがなだけ・作者と読みがある", bad.length === 0, bad.slice(0, 5).join(" / "));
  check("同じ上の句・同じ下の句・同じ作者は無い", new Set(UTA.map((u) => u[4])).size === 100 && new Set(UTA.map((u) => u[5])).size === 100 && new Set(UTA.map((u) => u[0])).size === 100);
  // よく知られた歌が、番号どおりの所にある（取りちがえ・ずれの見張り）
  const known = { 1: ["天智天皇", "あきのたの"], 2: ["持統天皇", "はるすぎて"], 17: ["在原業平朝臣", "ちはやぶる"], 18: ["藤原敏行朝臣", "すみのえの"], 57: ["紫式部", "めぐりあひて"], 62: ["清少納言", "よをこめて"], 9: ["小野小町", "はなのいろは"], 100: ["順徳院", "ももしきや"] };
  check("よく知られた歌が番号どおり（1 天智天皇・2 持統天皇・17 在原業平・18 藤原敏行・57 紫式部・62 清少納言・9 小野小町・100 順徳院）", Object.entries(known).every(([n, [au, k]]) => UTA[n - 1][0] === au && UTA[n - 1][4].startsWith(k)));

  // 決まり字を、game.js とは別の数え方で数え直す：読む音に直してから並べ、となりどうしの同じ所の長さ＋1
  const snd = (k) => k.split(" ").map((ph) => [...ph].map((c, i) => ({ ゐ: "い", ゑ: "え", を: "お", ぢ: "じ", づ: "ず" }[c] || (i > 0 && { は: "わ", ひ: "い", ふ: "う", へ: "え", ほ: "お" }[c]) || c)).join("")).join("");
  const S = UTA.map((u, i) => ({ no: i + 1, s: snd(u[4]) })).sort((a, b) => (a.s < b.s ? -1 : 1)), lcp = (a, b) => { let n = 0; while (a[n] && a[n] === b[n]) n++; return n; };
  const kn = {}; S.forEach((x, i) => { kn[x.no] = Math.max(i ? lcp(S[i - 1].s, x.s) : 0, i < 99 ? lcp(x.s, S[i + 1].s) : 0) + 1; });
  const diff = G.POEMS.filter((p) => p.kn !== kn[p.no]).map((p) => `${p.no}:${p.kn}/${kn[p.no]}`);
  check("決まり字の字数を、別の数え方（並べてとなりと比べる）で数え直すと100首とも同じ", diff.length === 0, diff.join(","));
  const one = G.POEMS.filter((p) => p.kn === 1).map((p) => G.sound(p.uh)[0]).sort().join("");
  check("1字決まりは「む・す・め・ふ・さ・ほ・せ」の7首（Wikipedia「決まり字」）", one === [..."むすめふさほせ"].sort().join(""), one);
  const six = G.POEMS.filter((p) => p.kn === 6).map((p) => p.no).sort((a, b) => a - b).join(",");
  check("6字決まり（大山札）は あさぼらけ（31・64）・きみがため（15・50）・わたのはら（11・76）の6首", six === "11,15,31,50,64,76", six);
  check("決まり字の字数は1〜6・どの歌も決まり字の前までは友札と同じ音・決まり字ではほかと分かれる", G.POEMS.every((p) => p.kn >= 1 && p.kn <= 6 && p.tomo.every((n) => G.BY[n].snd.slice(0, p.kn - 1) === p.snd.slice(0, p.kn - 1)) && G.POEMS.every((q) => q === p || q.snd.slice(0, p.kn) !== p.snd.slice(0, p.kn)) && (p.kn === 1) === (p.tomo.length === 0)));
}
{
  // 問題：選び肢の札・答え
  const bad = [], pos = [0, 0, 0, 0];
  for (const q of G.QS) {
    const P = G.make(`${q.lv}:${q.id}|q2027-01-01`), why = [];
    if (P.opts.length !== 4 || new Set(P.opts.map((x) => x.no)).size !== 4) why.push("4枚");
    if (P.opts[P.ans] !== P.p || P.opts.filter((x) => x === P.p).length !== 1) why.push("答え");
    if (q.lv === 1 && P.opts.some((x) => x !== P.p && x.snd[0] === P.p.snd[0])) why.push("ふつうに同じはじめの音");
    if (q.lv === 2 && (P.p.kn < 2 || !P.p.tomo.every((n) => P.opts.some((x) => x.no === n) || P.p.tomo.length > 3))) why.push("友札が入らない");
    if (q.lv === 2 && !P.opts.some((x) => x !== P.p && x.snd[0] === P.p.snd[0])) why.push("むずかしいに同じはじめの音が無い");
    if (JSON.stringify(G.optsOf(q.id)) !== JSON.stringify(G.optsOf(q.id))) why.push("毎回同じにならない");
    if (why.length) bad.push(q.id + " " + why.join("・"));
    pos[P.ans]++;
  }
  check(`問題（${G.QS.length}）：札は4枚・答えはちょうど1枚・ふつうはほかの札のはじめの音がちがう・むずかしいは友札（3枚まで全部）が入る`, bad.length === 0, bad.slice(0, 5).join(" / "));
  check("答えの札の場所は1〜4番に散らばる（どこも15%以上）", pos.every((n) => n / G.QS.length > 0.15), String(pos));
  check("問題の数：やさしい100・ふつう100・むずかしい93（2字決まり以上）", G.POOL.map((x) => x.length).join() === "100,100,93");
  const long = [];
  for (const q of G.QS) for (const f of G.facts(G.make(`${q.lv}:${q.id}|q2027-01-01`))) if ([...f].length > 90) long.push(q.id + ":" + f);
  check("説明は1行90字以内（一画面一問）", long.length === 0, long.slice(0, 3).join(" / "));
}
{
  // 今日の5問・上級の組み方（3年分）
  const bad = [], used = new Set();
  const dayOf = (i) => new Date(Date.parse(G.EPOCH) + i * 864e5).toISOString().slice(0, 10);
  for (let i = 0; i < 365 * 3; i++) {
    const d = dayOf(i), dl = G.dailyTags(d), hl = G.hardTags(d), di = dl.map(idOf), hi = hl.map(idOf);
    const no = (ids) => ids.map((q) => G.QBY[q].no);
    if (dl.length !== 5 || new Set(di).size !== 5 || dl.map((t) => t[0]).join() !== "0,0,1,1,2" || new Set(no(di)).size !== 5) bad.push(d + " 今日");
    if (hl.length !== 3 || hl.some((t) => t[0] !== "2") || new Set([...no(di), ...no(hi)]).size !== 8) bad.push(d + " 上級");
    if (JSON.stringify(dl) !== JSON.stringify(G.dailyTags(d)) || !dl.every((t) => t.endsWith("|d" + d))) bad.push(d + " 同じにならない");
    if (i > 0 && JSON.stringify(di) === JSON.stringify(G.dailyTags(dayOf(i - 1)).map(idOf))) bad.push(d + " 前の日と同じ");
    di.forEach((x) => used.add(x));
  }
  check("今日の5問（やさしい2・ふつう2・むずかしい1、同じ歌は1日に1回）と上級（むずかしい3・今日の5問と歌を重ねない）を3年分作れる・前の日と同じ5問にならない", bad.length === 0, bad.slice(0, 5).join(","));
  const worst = [];
  for (const [nm, f] of [["今日", G.dailyTags], ["上級", G.hardTags]]) for (const lv of [0, 1, 2]) {
    const seq = []; for (let i = 0; i < 365 * 3; i++) for (const t of f(dayOf(i))) if (+t[0] === lv) seq.push(idOf(t));
    if (!seq.length) continue; const n = G.POOL[lv].length, last = {}; let gap = Infinity;
    seq.forEach((x, j) => { if (last[x] != null) gap = Math.min(gap, j - last[x]); last[x] = j; });
    if (gap < Math.floor(n / 2) - 5) worst.push(`${nm}${lv}:${gap}/${n}`);
  }
  check("今日の5問・上級は、難しさごとに並びを1周するまで同じ問題を出さない（同じ問題の間は半周以上・3年分）", worst.length === 0, worst.join(","));
  check("3年のうちに、今日の5問で全部の問題が出る", G.POOL.every((p) => p.every((q) => used.has(q))), `${used.size}/${G.QS.length}`);
}
// ---- 2. ファイルの中身 ----
const html = readFileSync(path.join(root, "index.html"), "utf8"), game = readFileSync(path.join(root, "game.js"), "utf8");
const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https:\/\/fonts\.googleapis\.com(\/|$)|^https:\/\/ko-fi\.com\/satouaaaaa$|^https:\/\/www\.mext\.go\.jp\/|^https:\/\/ja\.(wikisource|wikipedia)\.org\/wiki\/|^https:\/\/www\.ogurasansou\.co\.jp\/site\/hyakunin\/$/.test(u));
check("外から読むのは文字（Google Fonts）だけ。スクリプト・広告・解析を入れない（出典のリンクは押したときに開くだけ）", ext.length === 0 && ![...html.matchAll(/<script[^>]+src="([^"]+)"/g)].some((m) => /^https?:/.test(m[1])), ext.join(","));
check("CSP で通信先を自分だけにしている", /connect-src 'self'/.test(html) && !/connect-src[^;"]*https/.test(html));
check("Math.random は練習・とことんの並び・回の名札だけ（今日の5問・上級・札の並びは日付と問題の乱数。game.js には無い）", (html.match(/Math\.random/g) || []).length === 2 && !/Math\.random/.test(game.replace(/^\s*\/\/.*$/gm, "")));
check("乱数は sort の比較の中で引かない（ブラウザで引く回数が変わる）", !/\.sort\(\s*\([^)]*\)\s*=>[^\n;]*\b(R|rng|rand|Math\.random)\s*\(/.test(html + game));
check("一行の式の途中にコメント // を足さない（行の残りが消える。rosen-hitofude 2026-11-04）", !/;\s*\/\/[^\n]*;\s*\w/.test(game.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")));
check("画面にお笑いの言葉を入れない（本物っぽく）", !/お笑い|ギャグ|ツッコミ|なんでやねん|（うそ）/.test(html));
check("チケット・回数制限・🔒で開くモードを入れない", !/🎫|🔒|チケット|あと\d+回|すると開く/.test(html));
check("このゲームについて：歌の本文の出典（Wikisource・小倉山荘）・決まり字の数え方と出典・学習指導要領（文部科学省）", ["Wikisource", "小倉山荘", "決まり字", "読む音で比べて", "文部科学省", "学習指導要領"].every((w) => html.includes(w)));
check("引き継ぎ：transfer.js をゲームの script より前に、このゲームの記録のキーだけで読む", /<script src="transfer\.js" data-game="hyakunin-awase" data-keys="hyakunin-v1"><\/script>\s*<\/head>/.test(html) && html.indexOf('src="transfer.js"') < html.indexOf('src="game.js"') && /data-hk/.test(html) && existsSync(path.join(root, "transfer.js")));
{ const og = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]+)"`)) || [])[1] || "";
  const png = readFileSync(path.join(root, "og.png"));
  check("SNS で貼ると絵と題が出る（OGP・1200×630・絶対URL）", og("og:title") && og("og:description") && og("og:image") === "https://satou-aaaaa.github.io/hyakunin-awase/og.png" && og("twitter:card") === "summary_large_image" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630); }
{ const fy = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8");
  check("感想フォームの name が3字以上（2字だとフォームが出ない。shared-workflows incidents/2026-11-05-feedback-form-not-shown.md）", [...((fy.match(/^name:\s*(.+)$/m) || [])[1] || "").trim()].length >= 3);
  check("感想フォームは名前・メールを聞かない", /id: fun/.test(fy) && !/id: (name|email|mail)/.test(fy) && /labels: \["感想"\]/.test(fy)); }
check("README の URL のすぐ後ろに全角の字を続けない（Link check が URL の一部と読む）", !/https?:\/\/[\x21-\x7e]*[^\x00-\x7f]/.test(readFileSync(path.join(root, "README.md"), "utf8").replace(/\]\(https?:\/\/[^)\s]+\)/g, "").replace(/<https?:\/\/[^>\s]+>/g, "")));
{ const sw = readFileSync(path.join(root, "sw.js"), "utf8"), mf = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  const shell = JSON.parse(sw.match(/SHELL = (\[[^\]]+\])/)[1]);
  check("PWA：sw.js は画面のファイルを全部保存し（引き継ぎの transfer.js も）、外へ何も送らない", ["./index.html", "./data.js", "./game.js", "./transfer.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"].every((f) => shell.includes(f) && existsSync(path.join(root, f))) && shell.every((f) => f === "./" || existsSync(path.join(root, f))) && !/https?:\/\//.test(sw.replace(/^\/\/.*$/gm, "")));
  check("PWA：入れるときはブラウザの保存を通さず取り直す（cache: \"reload\"。古い版が残らない）", /new Request\(u, \{ cache: "reload" \}\)/.test(sw));
  check("PWA：manifest にアイコン2つと名前がある", mf.name === "百人一首あわせ" && mf.icons.length >= 2 && mf.start_url === "./");
  check("PWA：maskable は字が切れないよう専用の絵（icon-maskable-512.png、中を縮めた絵）を使う", mf.icons.filter((i) => /maskable/.test(i.purpose || "")).every((i) => i.src === "icon-maskable-512.png") && existsSync(path.join(root, "icon-maskable-512.png")));
  const st = await checkSwStall(sw);
  check("PWA：通信が途中で止まっても、4秒ほどで保存した画面に切りかえる（ふつうの通信はネットの返事のまま。shared-workflows template/qa/sw-check.mjs）", st.ok, `${st.stalled}/${st.normal}`);
  {
    // このゲームの sw.js の戻り方（時間は100分の1）：? 付きは同じ URL の保存を先に使う・通信も保存の読み出しも止まったら60秒で Response.error()
    const swRun = (match) => { const L = {}; const ctx = { self: { addEventListener: (t, f) => (L[t] = f), location: { origin: "https://x.test" } }, caches: { match, open: async () => ({ put: async () => {} }) },
      fetch: async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("half")); } }), { status: 200 }),
      setTimeout: (f, ms) => setTimeout(f, ms / 100), clearTimeout, URL, Request, Response, Promise };
      vm.createContext(ctx); vm.runInContext(sw, ctx);
      return (url, lim) => Promise.race([new Promise((ok) => L.fetch({ request: { method: "GET", url, mode: "navigate" }, waitUntil() {}, respondWith: (pr) => pr.then(ok) })), new Promise((ok) => setTimeout(() => ok("timeout"), lim))]); };
    const exact = await swRun(async (rq, o) => new Response(o && o.ignoreSearch ? "loose" : String(rq.url).includes("?v=2") ? "exact" : "", { status: 200 }))("https://x.test/index.html?v=2", 200);
    const t0 = Date.now(), none = await swRun(() => new Promise(() => {}))("https://x.test/index.html", 1500), dt = Date.now() - t0;
    check("PWA：? 付きの URL は同じ URL の保存を先に使い、通信も保存の読み出しも止まったら60秒で Response.error() を返す", exact !== "timeout" && (await exact.text()) === "exact" && none !== "timeout" && none.type === "error" && dt >= 550 && dt < 1000, `${exact === "timeout" ? exact : "ok"}・${none === "timeout" ? none : none.type}・${dt}ms`);
  } }

// ---- 3. ブラウザで遊ぶ ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer((rq, res) => {
  const p = decodeURIComponent(new URL(rq.url, "http://x").pathname), f = path.join(root, p === "/" ? "index.html" : p);
  if ((f !== root && !f.startsWith(root + path.sep)) || !existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(readFileSync(f));
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
// 「今日」をずらして遊ぶ（第1回の日から日がたっていなくても、あとから・カレンダーを確かめる）。QA_SHIFT_DAYS で変えられる
const SHIFT = +(process.env.QA_SHIFT_DAYS || 10);
const TODAY = new Date(Date.now() + SHIFT * 864e5 + 9 * 3600e3).toISOString().slice(0, 10);
// 検査の間に日本時間の0時をまたがないよう、ブラウザの時刻は TODAY の正午（日本時間）から進める
const NOON = Date.parse(TODAY + "T03:00:00Z");
const dayBefore = (n) => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
async function newPage(w = 390, ctx) {
  const c = ctx || await browser.newContext({ viewport: { width: w, height: 800 } });
  if (!ctx) await shift(c);
  await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
  await p.goto(url); await p.waitForTimeout(200);
  return p;
}
const T0 = Date.now();
const shift = (c) => c.addInitScript((ms) => { const n = Date.now; Date.now = () => n() + ms; }, NOON - T0);
const closeHow = async (p) => { if (await p.locator("#howto[open]").count()) await p.click("#howto-ok"); };
const mem = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("hyakunin-v1") || "{}"));
const ansOf = (p) => p.evaluate(() => __hy.cur().P.ans);
async function solve(p, { wrong = 0 } = {}) {
  const a = await ansOf(p);
  for (let i = 0; i < wrong; i++) await p.click(`#pick button[data-v="${(a + 1 + i) % 4}"]`);
  await p.click(`#pick button[data-v="${a}"]`);
  await p.waitForSelector(".verdict");
}

try {
  const p = await newPage();
  check("はじめて開くと遊び方が出る", await p.locator("#howto[open]").count() === 1);
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  await p.reload(); await p.waitForTimeout(200);
  check("遊び方を Esc で閉じたあと、開き直しても遊び方が出ない（shared-workflows #186）", await p.locator("#howto[open]").count() === 0 && (await mem(p)).tut === true);
  {
    let miss = 0, okNow = 0;
    for (let t = 0; t < 10; t++) {
      const q = await newPage();
      if (t % 2 === 0) { await q.keyboard.press("Escape"); } else { await q.click("#howto-ok"); }
      const tut = await q.evaluate(() => (JSON.parse(localStorage.getItem("hyakunin-v1") || "{}")).tut === true);
      if (tut) okNow++; else miss++;
      await q.context().close();
    }
    check("遊び方は Esc・「わかった」のその場で「見た」が残る（10回すぐ読み直す）", miss === 0, `${okNow}/10`);
  }
  check("ホームに今日の5問・とことん・上級・練習・歌の帳・カレンダー・実績のボタン", (await Promise.all(["#go-d", "#go-e", "#go-h", "#go-p", "#go-dex", "#go-cal", "#go-ach"].map(async (q) => (await p.locator(q).count()) === 1 && (await p.locator(q).isVisible()) && (await p.locator(q).isEnabled())))).every(Boolean) && (await p.textContent("#go-d")).includes("今日の5問"));
  {
    await p.setViewportSize({ width: 390, height: 2400 });
    const b = await p.evaluate(() => [...document.querySelectorAll("#app > *")].map((e) => [e.className, Math.round(e.getBoundingClientRect().height)]));
    check("ホームの題は自分の高さだけ（縦に伸びて大きなすき間を作らない）", b[0][0] === "title" && b[0][1] < 130, JSON.stringify(b[0]));
    await p.setViewportSize({ width: 390, height: 800 });
  }

  // 今日の5問：1問目はまちがえる、2問目はヒント2回、ほかはそのまま
  await p.click("#go-d");
  const tags = await p.evaluate(() => __hy.load().runs.d.list);
  check("今日の5問は日付から決まる（game.js の dailyTags と同じ）", JSON.stringify(tags) === JSON.stringify(G.dailyTags(TODAY)));
  {
    const P0 = G.make(tags[0]);
    const say = await p.$$eval("[data-a11y-say]", (e) => e.map((x) => x.getAttribute("aria-label") || x.textContent).join(" "));
    const fl = await p.$$eval("#pick button", (bs) => bs.map((b) => b.getAttribute("aria-label")));
    check("やさしい問題の画面：読み札に上の句（漢字とかな）・取り札4枚（下の句のかな・大きい）・答える前は作者・決まり字を出さない", (await p.textContent("#yomi")).includes(P0.p.up) && (await p.textContent("#yomi")).includes(P0.p.uh) && await p.locator("#pick button").count() === 4 && P0.opts.every((x, v) => fl[v].includes(x.lh)) && (await p.locator("#pick button").first().boundingBox()).height >= 100 && !(await p.textContent("#app")).includes(P0.p.au));
    check("「読む」で読み札（上の句）と問いを読む", say.includes(P0.p.up) && say.includes("下の句の札はどれ"));
  }
  {
    const a = await ansOf(p), w = (a + 1) % 4;
    await p.click(`#pick button[data-v="${w}"]`);
    check("まちがえると ✕ の知らせ（role=status）・その答えは ✕ と取り消し線で押せない", (await p.textContent("#msg")).includes("✕") && (await p.getAttribute("#msg", "role")) === "status" && await p.locator(`#pick button[data-v="${w}"]:disabled.ng .x`).count() === 1);
    await p.click(`#pick button[data-v="${w}"]`, { force: true });
    check("同じ答えをもう一度押しても、まちがいを二度数えない", await p.evaluate(() => __hy.cur().wrong.length) === 1);
  }
  await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
  check("途中で閉じても続きから（同じ問題・まちがえた答えのまま）", await p.evaluate(() => __hy.cur().i === 0 && __hy.cur().wrong.length === 1) && await p.locator("#pick button.ng").count() === 1);
  await solve(p);
  {
    const P0 = G.make(tags[0]);
    const v = await p.textContent(".verdict");
    check("取ると ✓・歌の全部（上の句と下の句）・番号と作者・決まり字の説明（何字決まりか）・★2（まちがい1回）", (await p.textContent(".verdict .hd")).includes("✓ 取った") && v.includes(P0.p.up) && v.includes(P0.p.lo) && v.includes(P0.p.au) && v.includes(`${P0.p.kn}字決まり`) && (await p.textContent(".verdict .uta b")) === P0.p.kima && (await p.getAttribute(".verdict .stars", "aria-label")) === "星2つ");
  }
  check("正解したらヒント・答えのボタンは押せない", await p.locator("#hint").isHidden() && await p.locator("#pick button:disabled").count() === 4 && await p.locator("#pick button.yes").count() === 1);
  check("正解の知らせは前からある #msg（role=status）で読ませる・次の操作も言う", /✓ 取った！.*(次の問題へ|結果を見る)/.test(await p.textContent("#msg")));
  await p.click("#next");
  await p.click("#hint");
  {
    const P1 = G.make(tags[1]);
    check("やさしいのヒント1は、まちがいの札を1枚外す（点線と「ヒントで外した」・押せない）", await p.locator("#pick button.cut:disabled .cutl").count() === 1 && !(await p.locator(`#pick button[data-v="${P1.ans}"]`).isDisabled()));
    await p.click("#hint");
    check("ヒント2でもう1枚外して残り2枚・ヒントは2回まで", await p.locator("#pick button.cut").count() === 2 && await p.locator("#hint:disabled").count() === 1);
  }
  await solve(p);
  check("ヒント2回は★1", (await p.getAttribute(".verdict .stars", "aria-label")) === "星1つ");
  await p.click("#next");
  {
    // ふつう：読み札は決まり字だけ。ヒント1で上の句を全部、ヒント2でまちがいの札を2枚外す
    const P2 = G.make(tags[2]);
    check("ふつうの読み札は決まり字だけ（上の句の残りは出さない）", (await p.textContent("#yomi")).includes(P2.p.kima) && !(await p.textContent("#yomi")).includes(P2.p.up) && (await p.getAttribute("#yomi .kima", "aria-label")).includes(P2.p.kima));
    await p.click("#hint");
    check("ふつうのヒント1は上の句を全部見せる（札は外さない）", (await p.textContent("#yomi")).includes(P2.p.up) && await p.locator("#pick button.cut").count() === 0);
    await p.click("#hint");
    check("ふつうのヒント2はまちがいの札を2枚外す", await p.locator("#pick button.cut").count() === 2);
    await p.reload(); await p.waitForTimeout(150); await p.click("#go-d");
    check("ヒントを使ったあと開き直しても、上の句と外した札のまま", (await p.textContent("#yomi")).includes(P2.p.up) && await p.locator("#pick button.cut").count() === 2);
    await solve(p); await p.click("#next");
  }
  for (let i = 3; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  const s1 = await mem(p);
  check("5問で結果：今日の記録に1問ごとのまちがい＋ヒント（1・2・2・0・0）", JSON.stringify(s1.days[TODAY]?.m) === "[1,2,2,0,0]");
  const share = await p.textContent(".share");
  const words = G.dailyTags(TODAY).flatMap((t) => { const P = G.make(t); return [P.p.up.slice(0, 4), P.p.lh.slice(0, 4), P.p.kima, P.p.au]; });
  check("シェアの文に歌・答えを出さない（印だけ）", /第\d+回/.test(share) && /🟢/.test(share) && words.every((n) => !share.includes(n)), share);
  check("まちがいのある日は Ko-fi の一言を出さない", await p.locator(".kofi").count() === 0);
  check("結果に「あと少しの実績」と、続けて遊ぶ・上級のボタン・問題ごとの歌と決まり字", await p.locator("#achnext").count() === 1 && await p.locator("#go-e").count() === 1 && await p.locator("#go-h").count() === 1 && await p.locator(".rlist > div").count() === 5 && (await p.textContent(".rlist")).includes("決まり字"));
  check("歌の帳に取った歌が載る（5首）", Object.keys(s1.dex).length === 5);
  await p.click("#back");
  check("今日を終えたら、ホームは「今日の結果を見る」", (await p.textContent("#go-d")).includes("結果"));
  // 上級：ヒントなし・3問
  await p.click("#go-h");
  check("上級はヒントのボタンが無い・3問", await p.locator("#hint").count() === 0 && (await p.evaluate(() => __hy.load().runs.h.list.length)) === 3);
  for (let i = 0; i < 3; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  check("上級の記録は hdays に入る", (await mem(p)).hdays[TODAY]?.m.length === 3);
  // 練習：記録を増やさない
  await p.click("#back"); await p.click("#go-p"); await p.click('[data-t="1"]');
  const before = await mem(p);
  for (let i = 0; i < 5; i++) { await solve(p); await p.click("#next"); }
  await p.waitForTimeout(150);
  const after = await mem(p);
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  check("練習は今日の記録を増やさない（歌の帳の数はふえる）", JSON.stringify(after.days) === JSON.stringify(before.days) && sum(after.dex) === sum(before.dex) + 5);
  {
    const fresh = await p.evaluate(() => { let bad = 0; const s = __hy.load(); for (let n = 0; n < 200; n++) { const l = __hy.practiceList(s, 0, null); const ids = l.map((t) => t.split("|")[0].split(":")[1]); if (new Set(ids).size !== 5) bad++; const q = __hy.G.QBY[ids[0]]; if (s.dex[q.no] && __hy.G.POOL[0].some((x) => !s.dex[__hy.G.QBY[x].no])) bad++; } return bad; });
    check("練習は5問とも別の問題・まだ歌の帳に無い歌の問題が先に出る（200回）", fresh === 0, String(fresh));
  }
  // 手帳から場面を選んで練習
  await p.click("#back"); await p.click("#go-dex");
  check("歌の帳は20首ずつ5つの組・まだの歌は点線の枠と「まだ」・取った歌は ✓ と決まり字", await p.locator(".area").count() === 5 && await p.locator(".mlist .no").count() === 100 - Object.keys(after.dex).length && (await p.textContent(".mlist .no b")) === "まだ" && (await p.locator(".mlist div:not(.no) .km").count()) === Object.keys(after.dex).length);
  await p.click('[data-a="4"]'); await p.click('[data-t="1"]');
  check("組の練習はその組（81〜100番）の歌の問題だけ", (await p.evaluate(() => __hy.load().runs.p.list)).every((t) => G.QBY[idOf(t)].no > 80));
  // とことん：まちがえても終わらない・「ここで降りる」で終わる
  await p.click("#back"); await p.click("#go-e");
  const el = await p.evaluate(() => __hy.load().runs.e.list);
  check("とことんは、やさしい5→ふつう10→むずかしい全部（1つの並びで同じ問題は出ない）", el.length === 15 + G.POOL[2].length && el.slice(0, 5).every((t) => t[0] === "0") && el.slice(5, 15).every((t) => t[0] === "1") && new Set(el.map(idOf)).size === el.length);
  {
    const rep = await p.evaluate(() => { let bad = 0; for (let n = 0; n < 300; n++) { const l = __hy.endlessList(__hy.load(), n % 2 ? "t31" : null, n % 3 === 0); const id = (t) => t.split("|")[0].split(":")[1]; if (n % 2 && __hy.G.QBY[id(l[0])].no === 31) bad++; for (let i = 1; i < l.length; i++) { if (__hy.G.QBY[id(l[i - 1])].no === __hy.G.QBY[id(l[i])].no) bad++; } } return bad; });
    check("とことんは続けて同じ歌を出さない・前の回の最後の歌から始めない（300回）", rep === 0, String(rep));
  }
  await solve(p); await p.click("#next");
  await solve(p, { wrong: 2 }); await p.click("#next");
  check("とことんはまちがえても終わらない（いのちの数は無い）", await p.locator("#pick").isVisible() && await p.evaluate(() => __hy.load().runs.e.res.length) === 2);
  await solve(p); await p.click("#next");
  await p.reload(); await p.waitForTimeout(150);
  check("とことんは開き直すと続きから", (await p.textContent("#go-e")).includes("続きから"));
  await p.click("#go-e");
  {
    const real = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem("hyakunin-v1")); const id = s.runs.e.id; s.runs.e.id = "other"; localStorage.setItem("hyakunin-v1", JSON.stringify(s)); return id; });
    await p.click("#quit"); await p.waitForTimeout(150);
    check("古い画面の「ここで降りる」は、別のタブで始めた回を終わらせない", (await mem(p)).runs.e?.id === "other" && !(await mem(p)).ebest);
    await p.evaluate((id) => { const s = JSON.parse(localStorage.getItem("hyakunin-v1")); s.runs.e.id = id; localStorage.setItem("hyakunin-v1", JSON.stringify(s)); }, real);
    await p.reload(); await p.waitForTimeout(150); await p.click("#go-e");
  }
  await p.click("#quit"); await p.waitForTimeout(150);
  check("「ここで降りる」で終わり、自己ベスト（3枚）とまちがい・ヒントの数が出る", (await mem(p)).ebest === 3 && (await p.textContent("#eres")).includes("3枚") && (await p.textContent("#ebest")).includes("2回"));
  {
    // 引き継ぎコードなどで数の所に文字が入っても、画面に HTML として出さない
    const q = await newPage(); await closeHow(q);
    const q0 = G.POOL[0][0], tg = `0:${q0}|e2026-11-08.a.0`;
    await q.evaluate(([q0, tg]) => { const s = JSON.parse(localStorage.getItem("hyakunin-v1")) || { v: 1 }; s.ebest = '<img id="xss" src=x>'; s.tm = "<b>"; s.elast = "<b>"; s.dex = { 1: '"><b id="xss2">', bad: 3 };
      s.runs = { e: { mode: "e", id: "x", date: "2026-11-08", list: [tg], res: [], miss: '"><i id="xss3">' }, h: { list: "bad", res: [] }, p: { mode: "p", id: "y", date: "2026-11-08", list: ["0:nowhere|p2026-11-08"], res: [] },
        d: { mode: "d", id: "z", date: "x", list: [tg], res: [] }, w: { mode: "p", id: "w", date: "2026-11-08", list: [`2:${q0}|p2026-11-08`], res: [] }, "a:2026-11-09": { mode: "a", id: "a", date: "2026-11-09", list: [tg], res: [] } };
      s.days = { "2026-11-08": { m: [0, 0] }, "2026-11-09": { m: [0, 0, 0, 0, 0] } }; localStorage.setItem("hyakunin-v1", JSON.stringify(s)); }, [q0, tg]);
    await q.reload(); await q.waitForTimeout(250);
    const st = await q.evaluate(() => __hy.load());
    check("記録の形を直す：数の所の文字は0に・知らない問題・難しさの合わない問題・形のちがう途中経過・問題の数と合わない記録・途中経過は捨てる", st.ebest === 0 && st.tm === 0 && st.dex[1] === 0 && !("bad" in st.dex) && !st.elast && Object.keys(st.runs).join() === "e" && !st.days["2026-11-08"] && !!st.days["2026-11-09"], JSON.stringify(Object.keys(st.runs)));
    await q.click("#go-e").catch(() => {}); await q.waitForTimeout(150); await q.click("#quit").catch(() => {}); await q.waitForTimeout(150);
    check("記録の文字を HTML として出さない", await q.locator("#xss, #xss2, #xss3").count() === 0);
    await q.evaluate(() => { const s = JSON.parse(localStorage.getItem("hyakunin-v1")); s.ebest = { toString: 0 }; s.dex = { 1: { valueOf: 1 } }; s.runs = {}; localStorage.setItem("hyakunin-v1", JSON.stringify(s)); });
    const errs = []; q.on("pageerror", (e) => errs.push(e.message)); await q.reload(); await q.waitForTimeout(250);
    check("数の所に {\"toString\":0} のような物が入っても止まらず、ホームが出る", errs.length === 0 && await q.locator("#go-d").isVisible() && (await q.evaluate(() => __hy.load().ebest)) === 0, errs.join(","));
    await q.context().close();
  }
  {
    // 練習で30首目を取り、結果で「30首」を知らせる（知らせたら二度は出さない）
    const q = await newPage(); await closeHow(q);
    await q.evaluate((ids) => { const s = JSON.parse(localStorage.getItem("hyakunin-v1")) || { v: 1 }; s.dex = {}; for (const id of ids) s.dex[id] = 1; s.ach = {}; localStorage.setItem("hyakunin-v1", JSON.stringify(s)); }, G.IDS.slice(0, 29));
    await q.reload(); await q.waitForTimeout(150); await closeHow(q);
    await q.click("#go-p"); await q.click('[data-t="0"]');
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("前の回で取って知らせていない実績も、次の結果で知らせる（知らせたら二度は出さない）", (await q.textContent("#achnew").catch(() => "")).includes("30首") && (await mem(q)).ach.f30 === 1);
    await q.click("#back").catch(() => {}); await q.click("#go-p"); await q.click('[data-t="0"]');
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("知らせ終えた実績は次の結果に出さない", !(await q.textContent("#achnew").catch(() => "")).includes("30首"));
    await q.context().close();
  }
  // 実績・このゲームについて
  await p.click("#back"); await p.click("#go-ach");
  check("実績は15個で、腕前・集める・続けるの3つの組", await p.locator(".ach").count() === 15 && await p.locator(".agrp").count() === 3 && await p.locator(".ach.got").count() >= 2);
  check("達成した実績は ✓ の文字も付く（色だけで分けない）", (await p.textContent(".ach.got b")).startsWith("✓"));
  await p.click("#back"); await p.click("#f-about");
  check("このゲームについて：歌の出典と決まり字・学習指導要領のリンク", (await p.textContent("#about")).includes("学習指導要領") && (await p.textContent("#about")).includes("決まり字") && await p.locator("#about a").count() >= 4);
  await p.context().close();

  // まちがいなしの日は Ko-fi を1回だけ
  {
    const q = await newPage(); await closeHow(q); await q.click("#go-d");
    for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
    await q.waitForTimeout(150);
    check("全部まちがいなしで初めて終えたときだけ Ko-fi の一言", await q.locator(".kofi").count() === 1 && (await q.textContent(".big")).includes("まちがいなし"));
    await q.click("#back"); await q.click("#go-d");
    check("結果をもう一度見ても Ko-fi は出さない", await q.locator(".kofi").count() === 0);
    await q.context().close();
  }

  // カレンダー・あとから
  {
    const q = await newPage();
    await q.evaluate(([d2, d3]) => { localStorage.setItem("hyakunin-v1", JSON.stringify({ v: 1, tut: true, days: { [d2]: { m: [0, 0, 0, 0, 0] }, [d3]: { m: [1, 0, 0, 2, 0] } }, hdays: {}, adays: {}, dex: {}, runs: {}, kofi: {}, ach: {}, ebest: 0 })); }, [dayBefore(2), dayBefore(3)]);
    await q.reload(); await q.waitForTimeout(150);
    check("ホームの「続けて」は、きのうを休んだら — （休んだ日を責めない）", (await q.textContent(".stats")).includes("—"));
    await q.click("#go-cal");
    const lateList = await q.evaluate(() => __hy.lateDays(__hy.load()));
    const exp = [1, 4, 5, 6, 7].map(dayBefore).filter((d) => d >= G.EPOCH);
    check("カレンダー：取りこぼした過去7日（第1回から）を押せる", JSON.stringify(lateList) === JSON.stringify(exp), lateList.join(","));
    if (lateList.length) {
      const d = lateList[0];
      if (!(await q.locator(`.cal .miss[data-k="${d}"]`).count())) await q.click("#prev");
      await q.click(`.cal .miss[data-k="${d}"]`);
      check("あとから：その日の今日の5問と同じ問題", JSON.stringify(await q.evaluate((d) => __hy.load().runs["a:" + d].list, d)) === JSON.stringify(G.dailyTags(d)));
      for (let i = 0; i < 5; i++) { await solve(q); await q.click("#next"); }
      await q.waitForTimeout(150);
      const s = await mem(q);
      check("あとからは adays に入り、今日の記録・続けた日・シェア・Ko-fi には数えない", s.adays[d] && !s.days[d] && (await q.locator(".share").count()) === 0 && (await q.locator(".kofi").count()) === 0);
      await q.click("#go-cal");
      check("カレンダーに ↺ で残る", await q.locator(`.cal .c.late[data-k="${d}"]`).count() === 1);
    } else check("あとからの検査（QA_SHIFT_DAYS が小さく、まだ過去の日が無い）", true);
    await q.context().close();
  }

  // 古いタブ：同じ問題を2つのタブで開き、片方で答えたら、もう片方は二重に入れない
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }); await shift(ctx);
    const a = await newPage(390, ctx); await closeHow(a); await a.click("#go-d");
    const b = await ctx.newPage(); b.on("pageerror", (e) => errors.push(e.message)); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await solve(a);
    await b.click(`#pick button[data-v="${await ansOf(b)}"]`);
    await b.waitForTimeout(200);
    const s = await mem(a);
    check("古いタブで同じ問題に答えても二重に数えない", s.runs.d.res.length === 1 && Object.values(s.dex).reduce((x, y) => x + y) === 1);
    await a.click("#next"); await b.goto(url); await b.waitForTimeout(150); await b.click("#go-d");
    await a.click("#hint"); await a.click("#hint");
    await b.click("#hint");
    check("別のタブで使ったヒントの数を減らさない", (await mem(a)).runs.d.cur.hints === 2);
    await b.click(`#pick button[data-v="${await ansOf(b)}"]`); await b.waitForTimeout(150);
    check("別のタブで使ったヒントは、こちらで正解しても★に数える", (await mem(a)).runs.d.res[1]?.m === 2 && (await b.getAttribute(".verdict .stars", "aria-label")) === "星1つ");
    await ctx.close();
  }

  // スマホ幅でもはみ出さない・押す所は44px以上
  {
    const bad = [], small = [];
    for (const w of [320, 390]) {
      const q = await newPage(w); await closeHow(q);
      for (const go of [null, "#go-d", "wrong", "solve", "#go-cal", "#go-dex", "#go-ach", "#go-e", "#go-p", "#go-h"]) {
        if (go === "solve") { await solve(q); }
        else if (go === "wrong") { await q.click(`#pick button[data-v="${((await ansOf(q)) + 1) % 4}"]`); await q.click("#hint"); }
        else if (go) { await q.goto(url); await q.waitForTimeout(100); await q.click(go); }
        await q.waitForTimeout(100);
        const ov = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (ov > 0) bad.push(`${w}px ${go || "ホーム"} ${ov}px`);
        small.push(...(await q.$$eval("button:not([disabled]), a[href]", (bs) => bs.filter((b) => b.checkVisibility() && !b.closest(".cal")).filter((b) => b.getBoundingClientRect().height < 44).map((b) => (b.id || b.className || b.textContent).slice(0, 20)))).map((x) => `${w}:${x}`));
      }
      await q.context().close();
    }
    check("幅320pxでも横にはみ出さない", bad.length === 0, bad.join(" / "));
    check("押せる所は高さ44px以上", small.length === 0, [...new Set(small)].slice(0, 8).join(","));
  }
  {
    // いちばん長い上の句と下の句の歌も、幅320pxで札と読み札からはみ出さない
    const q = await newPage(320); await closeHow(q);
    const longest = [...G.QS].filter((x) => x.lv === 0).sort((x, y) => (G.BY[y.no].up.length + G.BY[y.no].lh.length) - (G.BY[x.no].up.length + G.BY[x.no].lh.length))[0];
    await q.evaluate((tag) => { const s = JSON.parse(localStorage.getItem("hyakunin-v1")); s.runs.p = { mode: "p", date: __hy.todayKey(), list: [tag, tag, tag, tag, tag], res: [], cur: null, id: "L" }; localStorage.setItem("hyakunin-v1", JSON.stringify(s)); __hy.play("p"); }, `${longest.lv}:${longest.id}|p${TODAY}`);
    const out = await q.evaluate(() => [...document.querySelectorAll("#pick button, #yomi")].filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).length);
    check("幅320pxで、いちばん長い歌も札と読み札からはみ出さない", out === 0, String(out));
    await q.context().close();
  }
  // 見やすさの設定を全部入れても、ページの一番下まで動ける
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } }); await shift(ctx);
    await ctx.addInitScript(() => localStorage.setItem("a11y-v1", JSON.stringify({ read: true, cvd: true, calm: true, say: true, ruby: true })));
    const q = await newPage(390, ctx); await closeHow(q);
    const r = await q.evaluate(() => { window.scrollTo(0, 1e5); const f = document.querySelector("footer").getBoundingClientRect(); return [scrollY, Math.round(f.bottom), innerHeight, getComputedStyle(document.documentElement).position]; });
    check("見やすさの設定を全部入れても、いちばん下まで動ける（html が固定されない）", r[0] > 0 && r[1] <= r[2] && r[3] === "static", r.join(","));
    await q.click("#go-d");
    check("色の見分けを助ける設定では、読み札を破線の枠にする（取り札と色だけで分けない）", await q.evaluate(() => getComputedStyle(document.querySelector("#yomi")).borderTopStyle === "dashed"));
    await ctx.close();
  }
  // キーボードだけで遊べる（Tab と Enter）
  {
    const q = await newPage(); await closeHow(q);
    await q.focus("#go-d"); await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    const a = await ansOf(q);
    let t = 0; for (; t < 30 && (await q.evaluate(() => document.activeElement && document.activeElement.dataset.v)) !== String(a); t++) await q.keyboard.press("Tab");
    await q.keyboard.press("Enter"); await q.waitForTimeout(100);
    check("キーボードだけ（Tab と Enter）で答えられる", await q.locator(".verdict").count() === 1);
    await q.context().close();
  }
} catch (e) { check("ブラウザでの検査が最後まで動く", false, e.stack.split("\n").slice(0, 3).join(" ")); }

// 引き継ぎコード（shared-workflows template/qa/transfer-check.mjs）
try {
  const sample = { "hyakunin-v1": JSON.stringify({ v: 1, tut: true, days: { "2026-11-08": { m: [0, 1, 0, 0, 2] } }, hdays: {}, adays: {}, dex: { 1: 1, 17: 2 }, runs: {}, kofi: {}, ach: {}, ebest: 7, tm: 2, t: 1 }) };
  await checkTransfer({ browser, url, game: "hyakunin-awase", sample, check, open: async (pg) => { if (await pg.locator("#howto[open]").count()) await pg.click("#howto-ok"); } });
} catch (e) { check("引き継ぎの検査が最後まで動く", false, e.message.split("\n")[0]); }
await browser.close();
server.close();
check("画面のエラーが無い", errors.length === 0, errors.slice(0, 3).join(" | "));

{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し）
  const { spawnSync } = await import("node:child_process");
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const ng = results.filter((r) => !r.ok);
const md = `# 百人一首あわせ QA\n\n${results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`).join("\n")}\n\n${ng.length ? `❌ ${ng.length}件` : `✅ ${results.length}項目すべて通過`}\n`;
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report/report.md"), md);
console.log(md);
process.exit(ng.length ? 1 : 0);
