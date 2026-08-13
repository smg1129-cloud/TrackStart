/*
 * portal.js — the client (association) portal.
 * Mock auth + upload + simulated AI categorization/flagging + review queue +
 * owner-request fulfillment with statutory checklist generation.
 */
window.RGPortal = (function () {
  "use strict";

  var state = RGStore.load();
  var SESSION = "rgfl_session";

  /* ---------------- Sample records (embedded text drives the demo AI) ------ */
  var SAMPLES = [
    { name: "Declaration-of-Condominium-Recorded.pdf",
      text: "Declaration of Condominium and recorded covenants and restrictions, including all amendments to the declaration and bylaws." },
    { name: "Board-Meeting-Minutes-2024-03-12.pdf",
      text: "Minutes of the regular board meeting. Agenda approved. Membership meeting scheduled." },
    { name: "Operating-Budget-2024.xlsx",
      text: "Annual operating budget and reserve schedule. Assessment income and expense ledger. Operating Account #0123456789 Routing 021000021. Corporate card on file 4111 1111 1111 1111 for vendor payments." },
    { name: "Owner-Roster-2024.csv",
      text: "Unit owner roster and membership directory. Owner: John Smith, Unit 12B, SSN 123-45-6789, email jsmith@example.com, phone (305) 555-0148." },
    { name: "Milestone-Inspection-Report-2023.pdf",
      text: "Milestone inspection report and structural integrity reserve study prepared by the engineer of record per 553.899." },
    { name: "Roofing-Service-Contract-ABC.pdf",
      text: "Service agreement and vendor contract. Scope of work for roof replacement. Winning bid attached." },
    { name: "Insurance-Policy-Wind-2024.pdf",
      text: "Property and wind insurance policy. Coverage limits and declarations page. Certificate of insurance." },
    { name: "ESA-Accommodation-Request-Unit-402.pdf",
      text: "Reasonable accommodation request letter. Emotional support animal. Physician note references the owner's diagnosis and disability." },
  ];

  /* ---------------- Auth ---------------- */
  function isAuthed() { return sessionStorage.getItem(SESSION); }

  function login(e) {
    if (e) e.preventDefault();
    var email = document.getElementById("lg-email").value || "manager@association.com";
    sessionStorage.setItem(SESSION, email);
    enterApp();
    return false;
  }
  function demoLogin() {
    sessionStorage.setItem(SESSION, "manager@bayshorevillas.com");
    enterApp();
    return false;
  }
  function logout() {
    sessionStorage.removeItem(SESSION);
    location.reload();
    return false;
  }

  function enterApp() {
    document.getElementById("login").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("who").textContent = isAuthed();
    initUpload();
    renderAll();
    go("dashboard");
  }

  /* ---------------- Routing ---------------- */
  function go(view) {
    document.querySelectorAll(".view").forEach(function (v) {
      v.classList.toggle("active", v.getAttribute("data-view") === view);
    });
    document.querySelectorAll(".side-link[data-view]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === view);
    });
    if (view === "records") renderFolders();
    if (view === "review") renderReview();
    if (view === "requests") renderRequests();
    if (view === "dashboard") renderDashboard();
    if (view === "settings") renderSettings();
    return false;
  }

  /* ---------------- Upload + AI pipeline ---------------- */
  function initUpload() {
    var dz = document.getElementById("dropzone");
    var input = document.getElementById("file-input");
    if (!dz || dz._wired) return;
    dz._wired = true;
    dz.addEventListener("click", function () { input.click(); });
    dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("drag"); });
    dz.addEventListener("dragleave", function () { dz.classList.remove("drag"); });
    dz.addEventListener("drop", function (e) {
      e.preventDefault(); dz.classList.remove("drag");
      handleFiles(e.dataTransfer.files);
    });
    input.addEventListener("change", function () { handleFiles(input.files); input.value = ""; });
  }

  function handleFiles(fileList) {
    var files = Array.from(fileList || []);
    if (!files.length) return;
    // Read text where possible (txt/csv), else fall back to filename only.
    var readers = files.map(function (f) {
      return new Promise(function (resolve) {
        if (/\.(txt|csv|md|json)$/i.test(f.name) && f.size < 500000) {
          var r = new FileReader();
          r.onload = function () { resolve({ name: f.name, text: String(r.result || "") }); };
          r.onerror = function () { resolve({ name: f.name, text: "" }); };
          r.readAsText(f);
        } else {
          resolve({ name: f.name, text: "" });
        }
      });
    });
    Promise.all(readers).then(function (docs) { processDocs(docs); });
  }

  function loadSamples() {
    processDocs(SAMPLES.map(function (s) { return { name: s.name, text: s.text }; }));
    return false;
  }

  function processDocs(docs) {
    go("upload");
    var box = document.getElementById("processing");
    var bar = document.getElementById("proc-bar");
    var label = document.getElementById("proc-label");
    var results = document.getElementById("upload-results");
    box.classList.remove("hidden");
    results.innerHTML = "";
    var i = 0;
    var added = [];

    function step() {
      if (i >= docs.length) {
        bar.style.width = "100%";
        label.textContent = "Done — " + docs.length + " document(s) processed.";
        state.docs = state.docs.concat(added);
        RGStore.save(state);
        renderAll();
        renderUploadResults(added, results);
        toast(added.length + " document(s) filed. " +
          added.filter(function (d) { return d.status === "review"; }).length + " flagged for review.");
        return;
      }
      var d = docs[i];
      var pct = Math.round(((i + 0.5) / docs.length) * 100);
      bar.style.width = pct + "%";
      label.textContent = "Reading & classifying: " + d.name;
      var type = state.association.type;
      var cat = FLRecords.categorize(d.name, d.text, type);
      var findings = FLRecords.scan(d.text);
      added.push({
        id: RGStore.nextId(state, "doc"),
        name: d.name,
        categoryId: cat.id,
        categoryName: cat.name,
        cite: cat.cite,
        findings: findings,
        status: findings.length ? "review" : "released",
        decision: findings.length ? null : "clean",
        createdAt: state.seq,
      });
      i++;
      setTimeout(step, 260);
    }
    step();
  }

  function renderUploadResults(added, box) {
    box.innerHTML = "<h3>Just processed</h3>" + added.map(function (d) {
      return docCard(d);
    }).join("");
  }

  function docCard(d) {
    var flags = d.findings.map(function (f) {
      return '<span class="pill ' + sevClass(f.severity) + '">' + f.label + " ×" + f.count + "</span>";
    }).join(" ");
    return '<div class="card" style="margin-bottom:12px">' +
      '<div class="flex" style="justify-content:space-between;flex-wrap:wrap">' +
      '<div><strong>' + esc(d.name) + "</strong><br>" +
      '<span class="pill teal">→ ' + d.categoryName + '</span> <span class="cite">§ ' + d.cite + "</span></div>" +
      "<div>" + statusPill(d) + "</div></div>" +
      (flags ? '<div class="tag-list" style="margin-top:12px">' + flags + "</div>" : "") +
      "</div>";
  }

  /* ---------------- Dashboard ---------------- */
  function renderDashboard() {
    var docs = state.docs;
    var flagged = docs.filter(function (d) { return d.status === "review"; });
    var openReqs = state.requests.filter(function (r) { return r.status === "open"; });
    var cats = {};
    docs.forEach(function (d) { cats[d.categoryId] = 1; });
    setText("s-docs", docs.length);
    setText("s-folders", Object.keys(cats).length);
    setText("s-flags", flagged.length);
    setText("s-reqs", openReqs.length);
    document.getElementById("assoc-pill").textContent =
      state.association.name + " · " + (state.association.type === "condo" ? "Ch. 718" : "Ch. 720");

    var rules = FLRecords.rulesFor(state.association.type);
    document.getElementById("dash-compliance").innerHTML =
      '<div class="finding">⏱ Owner requests due ' + rules.deadline + "</div>" +
      '<div class="finding">🔒 ' + flagged.length + " document(s) held from release pending review</div>" +
      '<div class="finding">📋 Checklist ' + (rules.checklistRequired ? "<strong>required</strong> for this association type" : "auto-generated (best practice)") + "</div>";

    var acts = docs.slice(-6).reverse().map(function (d) {
      return '<div class="doc-row"><span>' + (d.status === "review" ? "🚩" : "📄") + "</span>" +
        '<span class="dname">' + esc(d.name) + "</span>" +
        '<span class="dmeta"><span class="pill teal">' + d.categoryName + "</span>" + statusPill(d) + "</span></div>";
    }).join("");
    document.getElementById("activity").innerHTML = acts ||
      '<p class="muted mb-0">No activity yet. <a href="#" onclick="return RGPortal.loadSamples()">Load sample records</a> to see the pipeline.</p>';
  }

  /* ---------------- Folders ---------------- */
  function renderFolders() {
    var wrap = document.getElementById("folders");
    var empty = document.getElementById("records-empty");
    var cats = FLRecords.categoriesFor(state.association.type);
    document.getElementById("records-cite").textContent =
      state.association.type === "condo" ? "718.111(12)" : "720.303(4)";
    var used = cats.map(function (c) {
      var docs = state.docs.filter(function (d) { return d.categoryId === c.id; });
      if (!docs.length) return "";
      var rows = docs.map(function (d) {
        return '<div class="doc-row"><span>📄</span><span class="dname">' + esc(d.name) + "</span>" +
          '<span class="dmeta">' + statusPill(d) + "</span></div>";
      }).join("");
      return '<div class="folder"><div class="folder-head" onclick="this.parentNode.classList.toggle(\'open\')">' +
        "<span>📁</span><span class=\"fname\">" + c.name + "</span>" +
        '<span class="cite">§ ' + c.cite + " · keep " + c.retention + "</span>" +
        '<span class="pill fcount">' + docs.length + "</span></div>" +
        '<div class="folder-docs">' + rows + "</div></div>";
    }).join("");
    wrap.innerHTML = used;
    empty.classList.toggle("hidden", !!state.docs.length);
  }

  /* ---------------- Review queue ---------------- */
  function renderReview() {
    var list = document.getElementById("review-list");
    var pending = state.docs.filter(function (d) { return d.status === "review"; });
    if (!pending.length) {
      list.innerHTML = '<div class="card center"><div style="font-size:2.4rem">✓</div><h3>Nothing to review</h3><p class="muted mb-0">No documents are currently flagged for sensitive information.</p></div>';
      return;
    }
    list.innerHTML = pending.map(function (d) {
      var high = d.findings.some(function (f) { return f.severity === "high"; });
      var findings = d.findings.map(function (f) {
        return '<div class="finding">' + sevIcon(f.severity) + " <strong>" + f.label + "</strong> — " +
          f.count + " match(es) " + (f.samples.length ? "· e.g. " + f.samples.map(function (s) { return "<code>" + esc(s) + "</code>"; }).join(" ") : "") + "</div>";
      }).join("");
      return '<div class="review-card ' + (high ? "high" : "") + '">' +
        '<div class="flex" style="justify-content:space-between;flex-wrap:wrap">' +
        "<div><strong>" + esc(d.name) + "</strong><br><span class=\"pill teal\">" + d.categoryName + "</span></div>" +
        "<div>" + (high ? '<span class="pill red">High sensitivity</span>' : '<span class="pill amber">Review</span>') + "</div></div>" +
        '<div style="margin:12px 0">' + findings + "</div>" +
        '<div class="hero-actions" style="margin:0">' +
        '<button class="btn btn-navy btn-sm" onclick="RGPortal.decide(\'' + d.id + "','redacted')\">Mark redacted &amp; approve for release</button>" +
        '<button class="btn btn-ghost btn-sm" onclick="RGPortal.decide(\'' + d.id + "','withheld')\">Withhold from owners</button>" +
        "</div></div>";
    }).join("");
  }

  function decide(id, decision) {
    var d = state.docs.find(function (x) { return x.id === id; });
    if (!d) return;
    d.decision = decision;
    d.status = decision === "withheld" ? "withheld" : "released";
    RGStore.save(state);
    renderAll();
    renderReview();
    toast(decision === "withheld" ? "Document withheld from owner inspection." : "Document redacted & approved for release.");
  }

  /* ---------------- Owner requests + checklist ---------------- */
  function renderRequests() {
    var list = document.getElementById("requests-list");
    if (!state.requests.length) {
      list.innerHTML = '<div class="card center"><div style="font-size:2.2rem">📨</div><h3>No requests yet</h3><p class="muted">Owner requests submitted through the <a href="owners.html" target="_blank">owner portal</a> appear here for fulfillment.</p></div>';
      return;
    }
    list.innerHTML = state.requests.slice().reverse().map(function (r) {
      var badge = r.status === "fulfilled" ? '<span class="pill green">Fulfilled</span>' : '<span class="pill amber">Open</span>';
      var cats = (r.categoryIds || []).map(function (id) { return catName(id); });
      return '<div class="card" style="margin-bottom:14px">' +
        '<div class="flex" style="justify-content:space-between;flex-wrap:wrap">' +
        "<div><strong>" + esc(r.owner) + "</strong> · <span class=\"muted\">" + esc(r.email || "") + "</span><br>" +
        '<span class="cite">Request ' + r.id + " · received day 0 · due " + FLRecords.rulesFor(state.association.type).deadline + "</span></div>" +
        "<div>" + badge + "</div></div>" +
        '<p class="muted" style="margin:10px 0">Requested: ' + (r.allRecords ? "<em>All official records</em>" : cats.join(", ")) + (r.message ? '<br><span class="cite">“' + esc(r.message) + "”</span>" : "") + "</p>" +
        (r.status === "fulfilled"
          ? '<button class="btn btn-ghost btn-sm" onclick="RGPortal.viewChecklist(\'' + r.id + "')\">View records checklist</button>"
          : '<button class="btn btn-primary btn-sm" onclick="RGPortal.fulfill(\'' + r.id + "')\">Fulfill &amp; generate checklist</button>") +
        '<div id="cl-' + r.id + '" style="margin-top:16px"></div>' +
        "</div>";
    }).join("");
  }

  function requestedCategoryIds(r) {
    if (r.allRecords) {
      var ids = {};
      state.docs.forEach(function (d) { ids[d.categoryId] = 1; });
      return Object.keys(ids);
    }
    return r.categoryIds || [];
  }

  function buildChecklist(r) {
    var type = state.association.type;
    var catIds = requestedCategoryIds(r);
    return catIds.map(function (id) {
      var docs = state.docs.filter(function (d) { return d.categoryId === id; });
      var disposition, basis = "", cls = "green";
      if (!docs.length) {
        disposition = "No responsive records"; cls = "";
      } else {
        var withheld = docs.filter(function (d) { return d.status === "withheld"; });
        var redacted = docs.filter(function (d) { return d.decision === "redacted"; });
        var pending = docs.filter(function (d) { return d.status === "review"; });
        var released = docs.filter(function (d) { return d.status === "released"; });
        if (pending.length) {
          disposition = "Pending review — not yet releasable"; cls = "amber";
          basis = pending.length + " document(s) still in the review queue";
        } else if (released.length === 0 && withheld.length) {
          disposition = "Withheld in full"; cls = "red";
          basis = protectedBasis(type);
        } else if (redacted.length) {
          disposition = "Provided — redacted"; cls = "amber";
          basis = "Sensitive information removed per " + (type === "condo" ? "§ 718.111(12)(c)" : "§ 720.303(5)(c)") +
            (withheld.length ? "; " + withheld.length + " item(s) withheld" : "");
        } else {
          disposition = "Provided in full"; cls = "green";
        }
      }
      return { category: catName(id), count: docs.length, disposition: disposition, basis: basis, cls: cls };
    });
  }

  function protectedBasis(type) {
    return "Statutorily protected from inspection — " + (type === "condo" ? "§ 718.111(12)(c)" : "§ 720.303(5)(c)");
  }

  function fulfill(id) {
    var r = state.requests.find(function (x) { return x.id === id; });
    if (!r) return;
    r.checklist = buildChecklist(r);
    r.status = "fulfilled";
    r.fulfilledAt = state.seq;
    RGStore.save(state);
    renderAll();
    renderRequests();
    toast("Request fulfilled. Statutory checklist generated.");
    setTimeout(function () { viewChecklist(id); }, 50);
  }

  function viewChecklist(id) {
    var r = state.requests.find(function (x) { return x.id === id; });
    if (!r || !r.checklist) return;
    var type = state.association.type;
    var rules = FLRecords.rulesFor(type);
    var rows = r.checklist.map(function (c) {
      return "<tr><td><strong>" + c.category + "</strong><br><span class=\"cite\">" + c.count + " record(s)</span></td>" +
        '<td><span class="pill ' + c.cls + '">' + c.disposition + "</span></td>" +
        '<td class="muted">' + (c.basis || "—") + "</td></tr>";
    }).join("");
    document.getElementById("cl-" + id).innerHTML =
      '<div class="checklist-doc">' +
      "<h2 class=\"mt-0\">Official Records Request — Checklist</h2>" +
      '<p class="muted mb-0">' + esc(state.association.name) + " · " + rules.chapter + "</p>" +
      '<p class="cite">Requestor: ' + esc(r.owner) + " · Request " + r.id + "</p>" +
      '<table class="table"><thead><tr><th>Records category</th><th>Disposition</th><th>Basis / notes</th></tr></thead><tbody>' +
      rows + "</tbody></table>" +
      '<div class="callout ' + (rules.checklistRequired ? "" : "info") + '" style="margin-top:8px">' +
      (rules.checklistRequired
        ? "Chapter 718 requires this checklist of records made available and withheld; retain it for 7 years."
        : "Chapter 720 does not require a checklist, but this record documents a complete, good-faith response.") +
      "</div>" +
      '<button class="btn btn-ghost btn-sm" onclick="window.print()">Print / save PDF</button>' +
      "</div>";
  }

  /* ---------------- Settings ---------------- */
  function renderSettings() {
    document.getElementById("set-name").value = state.association.name;
    document.querySelectorAll("#type-seg button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-type") === state.association.type);
    });
  }
  function setType(t) {
    state.association.type = t;
    document.querySelectorAll("#type-seg button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-type") === t);
    });
  }
  function saveSettings() {
    state.association.name = document.getElementById("set-name").value || state.association.name;
    RGStore.save(state);
    renderAll();
    toast("Settings saved.");
  }
  function resetDemo() {
    state = RGStore.reset();
    renderAll();
    go("dashboard");
    toast("Demo data reset.");
  }

  /* ---------------- Shared render ---------------- */
  function renderAll() {
    renderDashboard();
    var flagged = state.docs.filter(function (d) { return d.status === "review"; }).length;
    var openReqs = state.requests.filter(function (r) { return r.status === "open"; }).length;
    badge("review-badge", flagged, "amber");
    badge("req-badge", openReqs, "teal");
  }

  /* ---------------- helpers ---------------- */
  function catName(id) {
    var c = FLRecords.categoriesFor(state.association.type).find(function (x) { return x.id === id; });
    return c ? c.name : id;
  }
  function statusPill(d) {
    if (d.status === "review") return '<span class="pill amber">In review</span>';
    if (d.status === "withheld") return '<span class="pill red">Withheld</span>';
    if (d.decision === "redacted") return '<span class="pill amber">Redacted · approved</span>';
    return '<span class="pill green">Released</span>';
  }
  function sevClass(s) { return s === "high" ? "red" : s === "medium" ? "amber" : "teal"; }
  function sevIcon(s) { return s === "high" ? "🔴" : s === "medium" ? "🟠" : "🔵"; }
  function badge(id, n, cls) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = n || "";
    el.className = "pill " + cls;
    el.style.display = n ? "" : "none";
  }
  function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ---------------- boot ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    if (isAuthed()) enterApp();
  });

  return {
    login: login, demoLogin: demoLogin, logout: logout, go: go,
    loadSamples: loadSamples, decide: decide, fulfill: fulfill, viewChecklist: viewChecklist,
    setType: setType, saveSettings: saveSettings, resetDemo: resetDemo,
  };
})();
