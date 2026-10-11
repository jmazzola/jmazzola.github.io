// A post's hand-written change list: the `changes` front matter, one entry per
// edit made after publishing (date, optional note, the text before and after),
// rendered newest first as word diffs of the Markdown.
const { diffWordsWithSpace } = require("diff");

const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ink = s => s.replace(/\s+/g, "").length;
const text = value => (value == null ? "" : String(value).replace(/\r\n?/g, "\n").trim());

// Unchanged text inside an edited paragraph: keep up to CONTEXT characters next
// to each edit, cut at a word boundary.
const CONTEXT = 80;
function head(s) {
  if (s.length <= CONTEXT) return s;
  const cut = s.slice(0, CONTEXT);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)) + " …";
}
function tail(s) {
  if (s.length <= CONTEXT) return s;
  const cut = s.slice(-CONTEXT);
  return "… " + cut.slice(cut.indexOf(" ") + 1);
}
function trimContext(text, first, last) {
  if (first && last) return text;
  if (first) return tail(text);
  if (last) return head(text);
  if (text.length <= CONTEXT * 2 + 20) return text;
  return head(text) + tail(text).slice(1);
}

function renderLine(sign, inner) {
  const kind = { "+": "add", "-": "del", "~": "mod" }[sign];
  const tone = sign === "+" ? " token inserted" : sign === "-" ? " token deleted" : "";
  return `<span class="diff-line diff-${kind}${tone}"><span class="diff-sign" aria-hidden="true">${sign}</span><span class="diff-text">${inner}</span></span>`;
}

function wholeLines(text, sign) {
  return text.split("\n").filter(line => line.trim()).map(line => renderLine(sign, escapeHtml(line)));
}

// Text that mostly survived gets an inline word diff; a rewrite shows as -/+
// lines, since a word diff of two unrelated sentences is confetti.
function renderDiff(before, after) {
  if (!before || !after) return before ? wholeLines(before, "-") : wholeLines(after, "+");
  const words = diffWordsWithSpace(before, after);
  const common = words.filter(w => !w.added && !w.removed).reduce((n, w) => n + ink(w.value), 0);
  if (common < 0.5 * Math.min(ink(before), ink(after))) {
    return [...wholeLines(before, "-"), ...wholeLines(after, "+")];
  }

  const lines = [[]];
  for (const w of words) {
    const type = w.added ? "ins" : w.removed ? "del" : "eq";
    w.value.split("\n").forEach((text, i) => {
      if (i > 0) lines.push([]);
      if (text) lines[lines.length - 1].push({ type, text });
    });
  }

  const out = [];
  for (const parts of lines) {
    const hasInk = type => parts.some(p => p.type === type && p.text.trim());
    if (!hasInk("ins") && !hasInk("del")) continue;
    if (!hasInk("eq") && !(hasInk("ins") && hasInk("del"))) {
      const sign = hasInk("ins") ? "+" : "-";
      out.push(renderLine(sign, escapeHtml(parts.filter(p => p.type !== (sign === "+" ? "del" : "ins")).map(p => p.text).join(""))));
      continue;
    }
    const inner = coalesce(parts).map((p, i, all) => {
      if (p.type === "eq") return escapeHtml(trimContext(p.text, i === 0, i === all.length - 1));
      const tag = p.type === "ins" ? "ins" : "del";
      const tone = p.type === "ins" ? "inserted" : "deleted";
      return `<${tag} class="token ${tone}">${escapeHtml(p.text)}</${tag}>`;
    }).join("");
    out.push(renderLine("~", inner));
  }
  return out;
}

// A run of edits separated only by spaces reads as one replacement:
// [-The timing of this-]{+Totally rewritten+}, not five word-by-word swaps.
function coalesce(parts) {
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].type === "eq") { out.push(parts[i]); continue; }
    const sides = { del: [], ins: [] };
    let end = i;
    for (let j = i; j < parts.length; j++) {
      const p = parts[j];
      if (p.type === "eq" && (p.text.trim() || j + 1 === parts.length || parts[j + 1].type === "eq")) break;
      if (p.type !== "ins") sides.del.push(p);
      if (p.type !== "del") sides.ins.push(p);
      end = j;
    }
    for (const type of ["del", "ins"]) {
      // spaces borrowed from between the edits never start or end a side
      const side = sides[type];
      while (side.length && side[0].type === "eq") side.shift();
      while (side.length && side[side.length - 1].type === "eq") side.pop();
      if (side.length) out.push({ type, text: side.map(p => p.text).join("") });
    }
    i = end;
  }
  return out;
}

// The h2 section a change landed in: where the first line of its `after` text
// sits in the post's Markdown, as an entry of the post's contents list. Text
// that was edited again later isn't in the post anymore, so older entries can
// have no section.
function locate(after, markdown, toc) {
  const needle = after.split("\n").map(line => line.trim()).find(Boolean);
  if (!needle) return null;
  let fenced = false;
  let h2 = -1;
  for (const line of String(markdown || "").split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced && /^##\s/.test(line)) h2++;
    if (line.includes(needle)) return toc[h2] || null;
  }
  return null;
}

module.exports = function renderChanges(changes, markdown, toc, inputPath) {
  if (changes == null) return [];
  if (!Array.isArray(changes)) throw new Error(`${inputPath}: \`changes\` must be a list of entries`);
  return changes.map((change, i) => {
    const where = `${inputPath}: changes[${i}]`;
    const date = new Date(change?.date);
    if (change?.date == null || Number.isNaN(date.getTime())) throw new Error(`${where} needs a date (YYYY-MM-DD)`);
    const before = text(change.before);
    const after = text(change.after);
    const html = renderDiff(before, after).join("");
    if (!html) throw new Error(`${where} needs a \`before\` and/or \`after\` that differ`);
    return { date, note: text(change.note), html, section: locate(after, markdown, toc) };
  }).sort((a, b) => b.date - a.date);
};
