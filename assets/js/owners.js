/*
 * owners.js — the owner-facing records request portal.
 * Owners submit inspection requests and track them; when the association
 * fulfills a request in the client portal, the owner sees the released
 * records and the statutory checklist here (same browser-local store).
 */
window.RGOwners = (function () {
  "use strict";

  var state = RGStore.load();

  function type() { return state.association.type; }

  function renderContext() {
    var rules = FLRecords.rulesFor(type());
    document.getElementById("assoc-context").innerHTML =
      "Requesting records from <strong>" + esc(state.association.name) + "</strong> — " +
      rules.chapter + ". Records are due <strong>" + rules.deadline + "</strong>.";
    document.getElementById("deadline-note").innerHTML =
      "2 · It must make records available <strong>" + rules.deadline + "</strong>.";
    var cats = FLRecords.categoriesFor(type());
    document.getElementById("cat-checks").innerHTML = cats.map(function (c) {
      return '<label class="finding" style="font-weight:500"><input type="checkbox" class="cat-check" value="' + c.id +
        '" style="width:auto;margin-right:8px" onchange="RGOwners.onCatChange()"> ' + c.name +
        ' <span class="cite">§ ' + c.cite + "</span></label>";
    }).join("");
  }

  function toggleAll() {
    var all = document.getElementById("ow-all").checked;
    document.querySelectorAll(".cat-check").forEach(function (c) { c.checked = false; c.disabled = all; });
  }
  function onCatChange() {
    // If a specific category is picked, clear "all"
    document.getElementById("ow-all").checked = false;
  }

  function submit() {
    var name = val("ow-name"), email = val("ow-email");
    if (!name || !email) { toast("Please enter your name and email."); return; }
    var all = document.getElementById("ow-all").checked;
    var cats = Array.from(document.querySelectorAll(".cat-check:checked")).map(function (c) { return c.value; });
    if (!all && !cats.length) { toast("Select records to request, or choose “All official records.”"); return; }

    state = RGStore.load(); // refresh in case association changed it
    var req = {
      id: RGStore.nextId(state, "REQ"),
      owner: name,
      email: email,
      unit: val("ow-unit"),
      allRecords: all,
      categoryIds: cats,
      message: val("ow-msg"),
      status: "open",
      createdAt: state.seq,
      checklist: null,
    };
    state.requests.push(req);
    RGStore.save(state);
    toast("Request " + req.id + " submitted.");
    // Jump to tracker prefilled
    document.getElementById("track-email").value = email;
    tab("track");
    track();
  }

  function tab(which) {
    document.getElementById("tab-new").classList.toggle("active", which === "new");
    document.getElementById("tab-track").classList.toggle("active", which === "track");
    document.getElementById("view-new").classList.toggle("hidden", which !== "new");
    document.getElementById("view-track").classList.toggle("hidden", which !== "track");
  }

  function track() {
    state = RGStore.load();
    var email = (val("track-email") || "").toLowerCase();
    var box = document.getElementById("track-results");
    if (!email) { box.innerHTML = '<p class="muted">Enter your email above to find your requests.</p>'; return; }
    var mine = state.requests.filter(function (r) { return (r.email || "").toLowerCase() === email; });
    if (!mine.length) {
      box.innerHTML = '<div class="card center"><p class="muted mb-0">No requests found for ' + esc(email) + ".</p></div>";
      return;
    }
    var rules = FLRecords.rulesFor(type());
    box.innerHTML = mine.slice().reverse().map(function (r) {
      var open = r.status === "open";
      var head = '<div class="flex" style="justify-content:space-between;flex-wrap:wrap">' +
        "<div><strong>Request " + r.id + "</strong><br><span class=\"cite\">" +
        (r.allRecords ? "All official records" : (r.categoryIds || []).map(catName).join(", ")) + "</span></div>" +
        "<div>" + (open ? '<span class="pill amber">Pending — due ' + rules.deadline + "</span>" : '<span class="pill green">Fulfilled</span>') + "</div></div>";
      var body;
      if (open) {
        body = '<p class="muted" style="margin:12px 0 0">Your association has received this request and is preparing the records. This page will show the documents and checklist once fulfilled.</p>';
      } else {
        body = releasedList(r) + checklistBlock(r, rules);
      }
      return '<div class="card" style="margin-bottom:14px">' + head + body + "</div>";
    }).join("");
  }

  function releasedList(r) {
    var catIds = r.allRecords ? usedCategoryIds() : (r.categoryIds || []);
    var docs = state.docs.filter(function (d) { return catIds.indexOf(d.categoryId) >= 0; });
    var releasable = docs.filter(function (d) { return d.status === "released"; });
    if (!releasable.length) {
      return '<p class="muted" style="margin-top:12px">No releasable documents were available for the requested categories.</p>';
    }
    return '<h3 style="margin:16px 0 8px">Records made available (' + releasable.length + ")</h3>" +
      releasable.map(function (d) {
        return '<div class="doc-row"><span>📄</span><span class="dname">' + esc(d.name) + "</span>" +
          '<span class="dmeta"><span class="pill teal">' + esc(d.categoryName) + "</span>" +
          (d.decision === "redacted" ? '<span class="pill amber">redacted</span>' : '<span class="pill green">provided</span>') +
          '<button class="btn btn-ghost btn-sm" onclick="RGOwners.viewDoc(\'' + d.id + "')\">View</button></span></div>";
      }).join("");
  }

  function checklistBlock(r, rules) {
    if (!r.checklist) return "";
    var rows = r.checklist.map(function (c) {
      return "<tr><td><strong>" + esc(c.category) + "</strong></td>" +
        '<td><span class="pill ' + c.cls + '">' + esc(c.disposition) + "</span></td>" +
        '<td class="muted">' + esc(c.basis || "—") + "</td></tr>";
    }).join("");
    return '<div class="checklist-doc" style="margin-top:16px">' +
      "<h3 class=\"mt-0\">Official Records Checklist</h3>" +
      '<p class="cite">' + esc(state.association.name) + " · " + rules.chapter + "</p>" +
      '<table class="table"><thead><tr><th>Category</th><th>Disposition</th><th>Basis / notes</th></tr></thead><tbody>' +
      rows + "</tbody></table></div>";
  }

  function viewDoc(id) {
    var d = state.docs.find(function (x) { return x.id === id; });
    if (!d) return;
    toast("Opening “" + d.name + "” — in production this streams the redacted file.");
  }

  /* helpers */
  function usedCategoryIds() {
    var ids = {}; state.docs.forEach(function (d) { ids[d.categoryId] = 1; }); return Object.keys(ids);
  }
  function catName(id) {
    var c = FLRecords.categoriesFor(type()).find(function (x) { return x.id === id; });
    return c ? c.name : id;
  }
  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById("toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderContext();
    // Deep link: ?track=email
    var m = location.search.match(/track=([^&]+)/);
    if (m) { document.getElementById("track-email").value = decodeURIComponent(m[1]); tab("track"); track(); }
  });

  return { tab: tab, toggleAll: toggleAll, onCatChange: onCatChange, submit: submit, track: track, viewDoc: viewDoc };
})();
