/* site.js — shared header + footer for the public informational pages. */
(function () {
  "use strict";

  var page = document.body.getAttribute("data-page") || "";

  // Shared favicon (avoids editing every page head).
  if (!document.querySelector('link[rel="icon"]')) {
    var fav = document.createElement("link");
    fav.rel = "icon";
    fav.href = "assets/favicon.svg";
    fav.type = "image/svg+xml";
    document.head.appendChild(fav);
  }

  var links = [
    { href: "index.html", id: "home", label: "Home" },
    { href: "how-it-works.html", id: "how", label: "How It Works" },
    { href: "law.html", id: "law", label: "The Law (718 & 720)" },
    { href: "faq.html", id: "faq", label: "FAQ" },
    { href: "contact.html", id: "contact", label: "Contact" },
  ];

  var navLinks = links
    .map(function (l) {
      return '<a href="' + l.href + '"' + (page === l.id ? ' class="active"' : "") + ">" + l.label + "</a>";
    })
    .join("");

  var header =
    '<header class="site-header"><div class="wrap"><nav class="nav" id="nav">' +
    '<a class="brand" href="index.html"><span class="mark">§</span><span>RecordsGuard&nbsp;FL<small>718 / 720 Compliance</small></span></a>' +
    '<div class="nav-links">' + navLinks + "</div>" +
    '<div class="nav-cta">' +
    '<a class="btn btn-ghost btn-sm" href="portal.html">Client Login</a>' +
    '<a class="btn btn-primary btn-sm" href="owners.html">Owner Records Request</a>' +
    "</div>" +
    '<button class="nav-toggle" aria-label="Menu" onclick="document.getElementById(\'nav\').classList.toggle(\'open\')">☰</button>' +
    "</nav></div></header>";

  var year = "2026"; // static build; avoids Date() nondeterminism in this environment
  var footer =
    '<footer class="site-footer"><div class="wrap">' +
    '<div class="footer-grid">' +
    "<div>" +
    '<a class="brand" href="index.html" style="color:#fff"><span class="mark">§</span><span>RecordsGuard&nbsp;FL</span></a>' +
    '<p class="legal-note" style="margin-top:14px">Records-inspection compliance for Florida condominium (Ch. 718) and homeowners (Ch. 720) associations. Secure digitization, AI-assisted organization, and audit-ready owner fulfillment.</p>' +
    "</div>" +
    '<div><h4>Product</h4><ul>' +
    '<li><a href="how-it-works.html">How It Works</a></li>' +
    '<li><a href="portal.html">Client Portal</a></li>' +
    '<li><a href="owners.html">Owner Request Portal</a></li>' +
    '<li><a href="law.html">The Statutes</a></li>' +
    "</ul></div>" +
    '<div><h4>Resources</h4><ul>' +
    '<li><a href="law.html#condo">Ch. 718 Records</a></li>' +
    '<li><a href="law.html#hoa">Ch. 720 Records</a></li>' +
    '<li><a href="law.html#protected">Protected Records</a></li>' +
    '<li><a href="faq.html">FAQ</a></li>' +
    "</ul></div>" +
    '<div><h4>Contact</h4><ul>' +
    '<li><a href="contact.html">Request a demo</a></li>' +
    '<li><a href="mailto:scott@associationlawfl.com">scott@associationlawfl.com</a></li>' +
    "</ul></div>" +
    "</div>" +
    '<div class="footer-bottom">' +
    "<span>© " + year + " RecordsGuard FL. A prototype demonstration.</span>" +
    "<span>Informational only — not legal advice. No attorney-client relationship is formed by use of this site.</span>" +
    "</div>" +
    "</div></footer>";

  var mount = document.getElementById("site-header");
  if (mount) mount.outerHTML = header;
  var fmount = document.getElementById("site-footer");
  if (fmount) fmount.outerHTML = footer;
})();
