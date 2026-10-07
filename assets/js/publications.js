/* ==========================================================================
   Publications list for /publications/ (_pages/publications.html)

   Reads assets/publications.bib in the browser and renders it as
     Authors. Year. Title. Journal volume(issue): pages.
   grouped into sections (articles / preprints / chapters) and by year.

   Sections: entries with note={Preprint} (or a *Rxiv / Research Square / SSRN
   journal) are preprints; @incollection / @inbook / @book are chapters;
   everything else is an article.
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- BibTeX parsing ---------- */

  // Read a {...}, (...) or "..." value whose opening delimiter is at text[i].
  // Nested braces are kept; returns [innerText, indexAfterClose].
  function readDelimited(text, i) {
    var open = text[i], start = i + 1, depth = 0;
    var close = open === "(" ? ")" : open === "{" ? "}" : '"';
    for (var k = start; k < text.length; k++) {
      var c = text[k];
      if (c === "\\") { k++; continue; }  // skip escaped character, e.g. \" or \}
      if (c === "{") depth++;
      else if (c === "}" && depth > 0) depth--;
      else if (c === close && depth === 0) return [text.slice(start, k), k + 1];
    }
    throw new Error("Unbalanced braces near: " + text.slice(i, i + 60));
  }

  function parseBibtex(text) {
    var entries = [], re = /@\s*([a-zA-Z]+)\s*[{(]/g, m;
    while ((m = re.exec(text))) {
      var type = m[1].toLowerCase(), i = re.lastIndex;
      // Find the matching close of the whole entry first
      var whole = readDelimited(text, i - 1);
      re.lastIndex = whole[1];
      if (type === "comment" || type === "string" || type === "preamble") continue;

      var body = whole[0], comma = body.indexOf(",");
      var entry = { type: type, key: body.slice(0, comma).trim(), fields: {} };
      var j = comma + 1;
      while (j < body.length) {
        var fm = /\s*([A-Za-z][\w-]*)\s*=\s*/y;
        fm.lastIndex = j;
        var f = fm.exec(body);
        if (!f) break;
        j = fm.lastIndex;
        var value;
        if (body[j] === "{" || body[j] === '"') {
          var r = readDelimited(body, j);
          value = r[0]; j = r[1];
        } else {
          var bare = /[^,\s}]+/y;
          bare.lastIndex = j;
          value = (bare.exec(body) || [""])[0];
          j = bare.lastIndex;
        }
        entry.fields[f[1].toLowerCase()] = value.replace(/\s+/g, " ").trim();
        var sep = body.indexOf(",", j);
        j = sep === -1 ? body.length : sep + 1;
      }
      entries.push(entry);
    }
    return entries;
  }

  /* ---------- LaTeX -> HTML ---------- */

  var ACCENTS = {
    '"': { a: "ä", o: "ö", u: "ü", e: "ë", i: "ï", A: "Ä", O: "Ö", U: "Ü" },
    "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", y: "ý", c: "ć", n: "ń", s: "ś", z: "ź", A: "Á", E: "É", O: "Ó" },
    "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È" },
    "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û" },
    "~": { a: "ã", n: "ñ", o: "õ", N: "Ñ" },
    "c": { c: "ç", C: "Ç" },
    "v": { c: "č", s: "š", z: "ž", r: "ř", e: "ě", C: "Č", S: "Š", Z: "Ž" }
  };
  var SYMBOLS = { ss: "ß", o: "ø", O: "Ø", aa: "å", AA: "Å", ae: "æ", AE: "Æ", l: "ł", L: "Ł", i: "ı" };

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function latexToHtml(s) {
    s = escapeHtml(s || "");
    s = s.replace(/\\(["'`^~])\{?\\?([a-zA-Z])\}?/g, function (all, acc, ch) {
      return (ACCENTS[acc] && ACCENTS[acc][ch]) || ch;
    });
    s = s.replace(/\\([cv])\{([a-zA-Z])\}/g, function (all, acc, ch) {
      return (ACCENTS[acc] && ACCENTS[acc][ch]) || ch;
    });
    s = s.replace(/\\(ss|aa|AA|ae|AE|o|O|l|L|i)(?![a-zA-Z])/g, function (all, sym) { return SYMBOLS[sym]; });
    s = s.replace(/\\(?:textit|emph|textsl)\{([^{}]*)\}/g, "<i>$1</i>");
    s = s.replace(/\\textbf\{([^{}]*)\}/g, "<b>$1</b>");
    s = s.replace(/\$([^$]*)\$/g, "$1");
    s = s.replace(/\\&amp;/g, "&amp;").replace(/\\([%$#_])/g, "$1");
    s = s.replace(/---/g, "—").replace(/--/g, "–").replace(/~/g, "&nbsp;");
    s = s.replace(/\\[a-zA-Z]+\s?/g, "");  // drop any other commands
    return s.replace(/[{}]/g, "");
  }

  function plain(s) {
    var div = document.createElement("div");
    div.innerHTML = latexToHtml(s);
    return div.textContent;
  }

  /* ---------- Formatting ---------- */

  // "Tobiasson, Victor A." / "Victor A. Tobiasson" -> {last: "Tobiasson", initials: "V.A."}
  function parseName(raw) {
    var name = plain(raw).trim(), last, first;
    if (name.indexOf(",") !== -1) {
      var parts = name.split(",");
      last = parts[0].trim();
      first = parts.slice(1).join(" ").trim();
    } else {
      var words = name.split(/\s+/);
      last = words.pop();
      first = words.join(" ");
    }
    var initials = first.split(/[\s.]+/).filter(Boolean).map(function (w) {
      return w.split("-").map(function (p) { return p.charAt(0).toUpperCase() + "."; }).join("-");
    }).join("");
    return { last: last, initials: initials, first: first };
  }

  function formatAuthors(field, highlight) {
    var names = (field || "").split(/\s+and\s+/i).filter(Boolean).map(parseName);
    var out = names.map(function (n) {
      var text = n.initials ? n.last + ", " + n.initials : n.last;
      text = escapeHtml(text);
      var key = (n.first.charAt(0) + " " + n.last).toLowerCase();
      return highlight.indexOf(key) !== -1 ? "<strong>" + text + "</strong>" : text;
    });
    if (out.length <= 2) return out.join(" and ");
    return out.slice(0, -1).join(", ") + ", and " + out[out.length - 1];
  }

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function monthNum(m) {
    if (!m) return 0;
    return parseInt(m, 10) || MONTHS[m.slice(0, 3).toLowerCase()] || 0;
  }

  function section(entry) {
    var f = entry.fields;
    if (/preprint/i.test(f.note || "") || /rxiv|research square|ssrn|preprint/i.test(f.journal || "")) return "preprints";
    if (entry.type === "incollection" || entry.type === "inbook" || entry.type === "book") return "chapters";
    return "articles";
  }

  function venue(entry) {
    var f = entry.fields;
    if (entry.type === "incollection" || entry.type === "inbook") {
      var v = "In: <em>" + latexToHtml(f.booktitle || f.title) + "</em>";
      if (f.editor) v += " (eds. " + escapeHtml(f.editor.split(/\s+and\s+/i).map(function (e) {
        var n = parseName(e); return n.last + ", " + n.initials;
      }).join(", ")) + ")";
      if (f.publisher) v += ". " + latexToHtml(f.publisher);
      return v;
    }
    var name = f.journal || f.booktitle || f.publisher || "";
    var v2 = name ? "<em>" + latexToHtml(name) + "</em>" : "";
    var vol = escapeHtml(f.volume || "") + (f.number ? "(" + escapeHtml(f.number) + ")" : "");
    var pages = latexToHtml(f.pages || "").replace(/-+/g, "–");
    var details = vol && pages ? vol + ": " + pages : (vol || pages);
    return details ? v2 + " " + details : v2;
  }

  function renderEntry(entry, highlight, number) {
    var f = entry.fields;
    var doi = (f.doi || "").replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
    var title = latexToHtml(f.title).replace(/\.$/, "");
    var html = formatAuthors(f.author || f.editor, highlight) + ". " + escapeHtml(f.year || "") + ". " +
               title + ". " + venue(entry) + ".";

    var badge = (f.note && !/^preprint$/i.test(f.note.trim())) ? f.note : "";
    if (badge) html += ' <span class="pub-entry__note">' + latexToHtml(badge) + "</span>";

    var links = [];
    if (doi) links.push('<a href="https://doi.org/' + encodeURI(doi) + '" target="_blank" rel="noopener">DOI</a>');
    if (f.pdf) links.push('<a href="' + encodeURI(f.pdf) + '" target="_blank" rel="noopener">PDF</a>');
    if (f.code) links.push('<a href="' + encodeURI(f.code) + '" target="_blank" rel="noopener">Code</a>');
    if (f.url && !/doi\.org\//.test(f.url)) links.push('<a href="' + encodeURI(f.url) + '" target="_blank" rel="noopener">Link</a>');
    if (links.length) html += '<span class="pub-entry__links">' + links.join("") + "</span>";

    var num = number ? '<span class="pub-entry__num">' + number + ".</span>" : "";
    return '<li class="pub-entry">' + num + html + "</li>";
  }

  var SECTIONS = [
    ["articles", "Peer-reviewed articles"],
    ["preprints", "Preprints"],
    ["chapters", "Book chapters"]
  ];

  function render(bibText, container) {
    var highlight = JSON.parse(container.getAttribute("data-highlight") || "[]").map(function (name) {
      var n = parseName(name);
      return (n.first.charAt(0) + " " + n.last).toLowerCase();
    });
    var entries = parseBibtex(bibText);
    entries.sort(function (a, b) {
      return (parseInt(b.fields.year, 10) || 0) - (parseInt(a.fields.year, 10) || 0) ||
             monthNum(b.fields.month) - monthNum(a.fields.month);
    });

    var html = "";
    SECTIONS.forEach(function (sec) {
      var list = entries.filter(function (e) { return section(e) === sec[0]; });
      if (!list.length) return;
      html += '<section class="people-section pub-section" id="' + sec[0] + '">' +
              '<p class="people-section__eyebrow">Publications</p><h2>' + sec[1] + "</h2>";
      var year = null;
      // Numbered oldest = 1 within each section, so a paper keeps its number
      // when newer ones are added and when the search filter hides others.
      // Preprints are not numbered.
      var numbered = sec[0] !== "preprints";
      list.forEach(function (e, idx) {
        if (e.fields.year !== year) {
          if (year !== null) html += "</ol></div>";
          year = e.fields.year;
          html += '<div class="pub-year"><h3 class="pub-year__label">' + escapeHtml(year || "In press") +
                  '</h3><ol class="pub-list">';
        }
        html += renderEntry(e, highlight, numbered ? list.length - idx : null);
      });
      html += "</ol></div></section>";
    });
    container.innerHTML = html || "<p>No publications yet.</p>";
    setupSearch(container);
  }

  /* ---------- Search ---------- */

  function setupSearch(container) {
    var input = document.getElementById("pub-search-input");
    var count = document.getElementById("pub-search-count");
    if (!input) return;
    var entries = container.querySelectorAll(".pub-entry");

    input.addEventListener("input", function () {
      var terms = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
      var shown = 0;
      entries.forEach(function (entry) {
        var text = entry.textContent.toLowerCase();
        var match = terms.every(function (t) { return text.indexOf(t) !== -1; });
        entry.hidden = !match;
        if (match) shown++;
      });
      container.querySelectorAll(".pub-year, .pub-section").forEach(function (group) {
        group.hidden = !group.querySelector(".pub-entry:not([hidden])");
      });
      count.textContent = terms.length ? shown + " of " + entries.length + " publications" : "";
    });
  }

  /* ---------- Load ---------- */

  window.renderPublications = render;  // exposed for testing

  document.addEventListener("DOMContentLoaded", function () {
    var container = document.getElementById("pub-list");
    if (!container) return;
    fetch(container.getAttribute("data-bib"), { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error(r.status + " " + r.statusText);
        return r.text();
      })
      .then(function (text) { render(text, container); })
      .catch(function (err) {
        container.innerHTML = '<p>Could not load the publication list (' + escapeHtml(String(err.message || err)) + ").</p>";
        if (window.console) console.error(err);
      });
  });
})();
