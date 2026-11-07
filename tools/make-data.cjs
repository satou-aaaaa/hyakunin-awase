// tools/uta.tsv（小倉百人一首の100首）から data.js を作る。data.js は手で直さない。
// uta.tsv の列：歌番号・作者・作者の読み・上の句・下の句・上の句のかな・下の句のかな（かなは歴史的仮名づかい。句の間は半角の空白）
// 本文は Wikisource「小倉百人一首」と小倉山荘「百人一首」の解説で照らし合わせた（AGENTS.md）。
const fs = require("fs"), path = require("path");
const rows = fs.readFileSync(path.join(__dirname, "uta.tsv"), "utf8").trim().split("\n").map((l) => l.split("\t"));
if (rows.length !== 100) throw new Error("100首ではない：" + rows.length);
const out = rows.map((r, i) => {
  if (r.length < 7 || +r[0] !== i + 1) throw new Error("形がちがう行 " + (i + 1));
  const [, au, auk, up, lo, uh, lh] = r;
  if (uh.split(" ").length !== 3 || lh.split(" ").length !== 2) throw new Error("句の数がちがう " + (i + 1));
  return [au, auk, up, lo, uh, lh];
});
const js = "// tools/make-data.cjs で作る（手で直さない）。小倉百人一首の100首：[作者, 作者の読み, 上の句, 下の句, 上の句のかな, 下の句のかな]\n" +
  "(function (root) {\n  const UTA = [\n" + out.map((r) => "    " + JSON.stringify(r) + ",").join("\n") + "\n  ];\n" +
  "  if (typeof module === \"object\" && module.exports) module.exports = UTA;\n  root.HYAKUNIN_UTA = UTA;\n})(typeof window !== \"undefined\" ? window : globalThis);\n";
fs.writeFileSync(path.join(__dirname, "..", "data.js"), js);
console.log("data.js：" + out.length + "首");
