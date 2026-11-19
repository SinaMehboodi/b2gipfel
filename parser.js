/* Karteikasten – reads the Wortschatz section of a course protocol (text lines) and builds cards.
   Works in the browser (window.KKParser) and in Node (module.exports). */
(function (root) {
  'use strict';
  const NOISE = /^(NOM|AKK|DAT|GEN|REDEMITTEL|WÖRTER|I\. WORTSCHATZ|AKK = rot|DAT = grün|GEN = lila|Redemittel = gelb)$/;
  const SECTION = /^([A-H])\.\s+([A-ZÄÖÜ][A-ZÄÖÜ \-\/&]+)$/;
  const ENTRY = /^(\d{1,2})([a-z])?\.\s*(.*)$/;
  const MARK = /^(=>|→|->|-\s|–|•|[ivx]+\.\s|\(\w\)|[A-Z]\.\s|Antwort|Frage|Nomen:|Verb:)/;
  const NOSPLIT = /^(Nominalisierung|Adjektiv|Adverb|Verb|Nomen|Komposit|Synonym|Gegenteil|Plural|Perfekt|Präteritum|aber|auch|vgl)/i;
  const LAB = /^(Nominalisierung|Adjektiv|Adverb|Verb|Nomen|Komposita|Synonym|Gegenteil|Plural|Partizip(?: I| II)?)\s*:\s*/i;
  const OBJ = /\b(etwas|jemanden|jemandem|jemand|jmdn\.?|jmdm\.?)\b\s*/g;

  function sectionLines(lines) {
    let idx = [];
    lines.forEach((l, i) => { if (/^\s*I\.\s+WORTSCHATZ/.test(l)) idx.push(i); });
    if (!idx.length) return null;
    let e = lines.length;
    for (let i = idx[idx.length - 1] + 1; i < lines.length; i++) {
      if (/^\s*(II|III|IV|V)\.\s+[A-ZÄÖÜ]/.test(lines[i])) { e = i; break; }
    }
    return lines.slice(idx[0] + 1, e);
  }

  function joinLines(raw) {
    const out = []; let prevBlank = true;
    for (const l of raw) {
      const t = l.replace(/\s+/g, ' ').trim();
      if (!t || NOISE.test(t)) { prevBlank = true; continue; }
      const startsNew = prevBlank || MARK.test(t) || ENTRY.test(t) || SECTION.test(t) || t.startsWith('=');
      if (!startsNew && out.length) {
        const p = out[out.length - 1];
        out[out.length - 1] = (p.endsWith('-') && !p.endsWith(' -')) ? p + t : p + ' ' + t;
      } else out.push(t);
      prevBlank = false;
    }
    return out;
  }

  function headword(s) {
    s = s.replace(/^(→|->|[ivx]+\.)\s*/, '').trim();
    const m = s.match(/\s*=>\s*|\s*=\s*/);
    if (m && m.index > 0) return [s.slice(0, m.index).trim(), s.slice(m.index + m[0].length).trim()];
    const m2 = s.match(/^([^:]{2,40}):\s+(.+)$/);
    if (m2 && m2[1].split(/\s+/).length <= 4 && !NOSPLIT.test(s)) return [m2[1].trim(), m2[2].trim()];
    return [s, ''];
  }
  function splitHead(s) {
    const m = s.match(/\s*=>\s*|\s*=\s*/);
    if (m && m.index > 0) return [s.slice(0, m.index).trim(), s.slice(m.index + m[0].length).trim()];
    return [s.trim(), ''];
  }
  function classify(t) {
    if (t.startsWith('=>')) return ['ex', t.slice(2).trim()];
    if (t.startsWith('→') || t.startsWith('->')) return ['rel', t.replace(/^(→|->)\s*/, '')];
    if (/^[ivx]+\.\s/.test(t)) return ['sub', t.replace(/^[ivx]+\.\s*/, '')];
    if (/^(-|–|•)\s/.test(t)) return ['li', t.slice(1).trim()];
    return ['txt', t];
  }

  function rawEntries(lines) {
    const sec = sectionLines(lines);
    if (!sec) return [];
    const ls = joinLines(sec);
    const cards = []; let section = 'Wörter', cur = null, last = 0;
    for (const t of ls) {
      let m = t.match(SECTION);
      if (m) { section = m[2].trim().toLowerCase().replace(/(^|\s)\S/g, x => x.toUpperCase()); last = 0; continue; }
      m = t.match(ENTRY);
      if (m) {
        const n = +m[1];
        if (n === last + 1 || n === 1 || (m[2] && (n === last || n === last + 1))) {
          last = n; cur = { section, n, body: [] }; cards.push(cur);
          if (m[3].trim()) cur.body.push(m[3].trim());
          continue;
        }
      }
      if (!cur) { cur = { section, n: 0, body: [] }; cards.push(cur); }
      cur.body.push(t);
    }
    const out = [];
    for (const c of cards) {
      if (!c.body.length) continue;
      let items = c.body.map(classify);
      const [fk, first] = items[0];
      let front, d = '';
      if (fk === 'txt') { [front, d] = headword(first); items = items.slice(1); }
      else front = [...new Set(items.filter(([k]) => k === 'rel' || k === 'sub').map(([, s]) => headword(s)[0]))].slice(0, 3).join(' · ');
      const groupLike = fk !== 'txt' || front.trim().endsWith(':');
      let splitKind = null;
      if (groupLike) { const f = items.find(([k]) => k === 'li' || k === 'rel' || k === 'sub'); if (f) splitKind = f[0]; }
      let children = [];
      if (splitKind) {
        for (const [k, s] of items) {
          if (k === splitKind && !NOSPLIT.test(s)) { const [h, dd] = headword(s); children.push({ front: h, def: dd, items: [] }); }
          else if (children.length) children[children.length - 1].items.push([k, s]);
          else { children = null; break; }
        }
      }
      if (children && children.length >= 2) {
        const grp = fk === 'txt' ? front.replace(/:\s*$/, '').trim() : '';
        for (const ch of children) out.push({ section: c.section, group: grp, front: ch.front, def: ch.def, items: ch.items });
        continue;
      }
      out.push({ section: c.section, group: '', front, def: d, items });
    }
    return out;
  }

  function verbForms(head, V) {
    let chunk = head.split(/→|\(|\+|=|\/|;|,|:/)[0].trim();
    const refl0 = chunk.split(/\s+/).includes('sich');
    chunk = chunk.replace(OBJ, '').trim();
    const toks = chunk.split(/\s+/).filter(x => x && x !== 'sich');
    if (toks.length !== 1) return null;
    const t = toks[0];
    if (!V[t]) return null;
    let [p, pf] = V[t];
    const refl = refl0 || / sich\b/.test(p) || / sich\b/.test(pf);
    if (refl && !/\bsich\b/.test(p)) { const ps = p.split(' '); p = [ps[0], 'sich', ...ps.slice(1)].join(' '); }
    if (refl && !/\bsich\b/.test(pf)) pf = pf.replace(/^(hat|ist) /, 'hat sich ');
    return [(refl ? 'sich ' : '') + t, p, pf];
  }
  function shortExample(exs) {
    exs = exs.filter(e => e && e.length > 3);
    if (!exs.length) return '';
    const good = exs.filter(e => e.split(/\s+/).length >= 5);
    return (good.length ? good : exs).reduce((a, b) => b.length < a.length ? b : a);
  }

  function buildCards(lines, V, idPrefix) {
    const cards = [];
    rawEntries(lines).forEach((c, i) => {
      if (/^[A-ZÄÖÜ .\-]+$/.test(c.front.trim())) return;
      if (!c.def && c.front.includes('→')) { const k = c.front.indexOf('→'); c.def = c.front.slice(k + 1).trim(); c.front = c.front.slice(0, k).trim(); }
      const id = idPrefix + '-' + (i + 1);
      const parent = { id, section: c.section, group: c.group, front: c.front, def: c.def, notes: c.items, family: [] };
      const ownEx = [], children = []; let owner = null;
      for (const [k, s] of c.items) {
        if (k === 'rel') {
          let body = s, lab = '';
          const m = body.match(LAB);
          if (m) { lab = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); body = body.slice(m[0].length); }
          const [h, d] = splitHead(body);
          if (h.length >= 3 && h.length <= 60 && !h.endsWith(':')) { owner = { front: h, def: d, label: lab, ex: [] }; children.push(owner); }
          else owner = null;
          continue;
        }
        if (k === 'ex') (owner ? owner.ex : ownEx).push(s);
        else if (k === 'sub') owner = null;
      }
      if (!parent.def) { const ft = c.items.find(([k]) => k === 'txt' || k === 'sub' || k === 'li'); if (ft && ft[1].length < 160) parent.def = ft[1]; }
      parent.ex = shortExample(ownEx) || shortExample(c.items.filter(([k]) => k === 'ex').map(([, s]) => s));
      parent.forms = verbForms(c.front, V);
      parent.family = children.map(ch => ch.front);
      cards.push(parent);
      const pk = c.front.toLowerCase().trim();
      children.filter(x => (x.def || x.ex.length) && x.front.toLowerCase().trim() !== pk).forEach((ch, j) => {
        cards.push({ id: id + '-f' + (j + 1), section: c.section, group: c.group, front: ch.front, def: ch.def, label: ch.label,
          ex: shortExample(ch.ex), forms: verbForms(ch.front, V), parent: c.front, family: children.filter(x => x !== ch).map(x => x.front) });
      });
    });
    return cards;
  }

  function lessonInfo(lines) {
    const head = lines.slice(0, 12).join('\n');
    const n = head.match(/UNTERRICHT\s+(\d+)/i);
    const d = head.match(/(\d{1,2}\.\s+[A-Za-zÄÖÜäöü]+\s+20\d\d)/);
    return { num: n ? +n[1] : null, date: d ? d[1] : '' };
  }

  /* pdf.js page text -> lines, inserting blank lines where the vertical gap is large */
  async function pdfToLines(pdf) {
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const rows = [];
      for (const it of tc.items) {
        if (!('str' in it)) continue;
        const y = it.transform[5], x = it.transform[4], h = Math.abs(it.transform[3]) || it.height || 10;
        let row = rows.find(r => Math.abs(r.y - y) < h * 0.45);
        if (!row) { row = { y, h, parts: [] }; rows.push(row); }
        row.parts.push({ x, s: it.str, w: it.width || 0 });
      }
      rows.sort((a, b) => b.y - a.y);
      let prevY = null, prevH = 12;
      for (const r of rows) {
        r.parts.sort((a, b) => a.x - b.x);
        let txt = '', end = null;
        for (const pt of r.parts) {
          if (end !== null && pt.x - end > 2 && !txt.endsWith(' ') && !pt.s.startsWith(' ')) txt += ' ';
          txt += pt.s; end = pt.x + pt.w;
        }
        if (!txt.trim()) continue;
        if (prevY !== null && prevY - r.y > Math.max(prevH, r.h) * 1.9) lines.push('');
        lines.push(txt);
        prevY = r.y; prevH = r.h;
      }
      lines.push('');
    }
    return lines;
  }

  const api = { buildCards, lessonInfo, pdfToLines, rawEntries };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KKParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
