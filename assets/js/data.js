/*
 * data.js — Domain model for Florida association official-records compliance.
 *
 * This single file is the source of truth for the whole prototype:
 *   - the official-records taxonomy for condominium (Ch. 718) and HOA (Ch. 720),
 *   - the categories of records that are NOT accessible to owners/members,
 *   - the sensitive-information detectors used by the (simulated) AI pipeline,
 *   - statutory deadlines and penalties surfaced across the public pages.
 *
 * Statutory citations are approximate and provided for product design only.
 * This is NOT legal advice and NOT a substitute for reading the current statute.
 */

window.FLRecords = (function () {
  "use strict";

  /* ----------------------------------------------------------------------
   * 1. OFFICIAL-RECORDS TAXONOMY
   *    Each category is a "folder" the AI pipeline sorts documents into.
   *    `keywords` drive the prototype's auto-categorization (filename + any
   *    text a real OCR/AI backend would extract).
   *    `retention` is the minimum retention the association must observe.
   * -------------------------------------------------------------------- */

  const CONDO_CATEGORIES = [
    {
      id: "governing",
      name: "Governing Documents",
      cite: "718.111(12)(a)1–6",
      retention: "Permanent",
      desc: "Recorded declaration & amendments, articles of incorporation, bylaws, and the current rules and regulations.",
      keywords: ["declaration", "bylaw", "by-law", "articles", "incorporation", "amendment", "covenant", "governing", "rules", "regulation"],
    },
    {
      id: "plans",
      name: "Plans, Permits & Warranties",
      cite: "718.111(12)(a)1",
      retention: "Permanent",
      desc: "As-built plans, land surveys, permits, warranties, and other documents delivered by the developer at turnover.",
      keywords: ["plan", "survey", "permit", "warranty", "as-built", "blueprint", "developer", "turnover", "plat"],
    },
    {
      id: "minutes",
      name: "Meeting Minutes",
      cite: "718.111(12)(a)6",
      retention: "7 years",
      desc: "Minutes of all board and membership meetings.",
      keywords: ["minutes", "meeting", "board meeting", "agenda", "membership meeting", "annual meeting"],
    },
    {
      id: "membership",
      name: "Membership & Unit Roster",
      cite: "718.111(12)(a)7",
      retention: "Current",
      desc: "Current roster of unit owners, mailing addresses, unit identifications, and voting certifications.",
      keywords: ["roster", "directory", "owner list", "membership list", "unit owner", "voting certificate"],
    },
    {
      id: "insurance",
      name: "Insurance Policies",
      cite: "718.111(12)(a)9",
      retention: "Current + claims",
      desc: "Current insurance policies of the association and related claim information.",
      keywords: ["insurance", "policy", "coverage", "claim", "declarations page", "certificate of insurance", "liability", "flood", "wind"],
    },
    {
      id: "contracts",
      name: "Contracts, Leases & Bids",
      cite: "718.111(12)(a)10–12",
      retention: "7 yrs (bids 1 yr)",
      desc: "Management agreements, leases, service contracts, and bids for materials, equipment, or services.",
      keywords: ["contract", "agreement", "lease", "management agreement", "bid", "proposal", "vendor", "service", "scope of work"],
    },
    {
      id: "financial",
      name: "Accounting & Financial Records",
      cite: "718.111(12)(a)11",
      retention: "7 years",
      desc: "Accurate, itemized accounting records: accounts, invoices, receipts, ledgers, budgets, financial reports, and tax returns.",
      keywords: ["budget", "invoice", "receipt", "ledger", "financial", "balance sheet", "income", "expense", "tax return", "audit", "assessment", "reserve", "bank statement", "account"],
    },
    {
      id: "elections",
      name: "Elections, Ballots & Proxies",
      cite: "718.111(12)(a)8",
      retention: "1 year",
      desc: "Ballots, sign-in sheets, voting proxies, and election materials.",
      keywords: ["ballot", "proxy", "election", "sign-in", "sign in sheet", "voting", "candidate", "nomination"],
    },
    {
      id: "structural",
      name: "Structural Integrity & Milestone Inspections",
      cite: "718.111(12)(a)16 & 553.899",
      retention: "15 years",
      desc: "Structural Integrity Reserve Study (SIRS) and milestone inspection reports.",
      keywords: ["sirs", "structural integrity", "reserve study", "milestone", "inspection report", "engineer", "553.899", "life-safety", "recertification"],
    },
    {
      id: "rentals",
      name: "Association-Leased Units",
      cite: "718.111(12)(a)13",
      retention: "7 years",
      desc: "Records of any unit leased by the association.",
      keywords: ["rental", "tenant", "lease agreement", "occupancy", "leased unit"],
    },
    {
      id: "other",
      name: "Other Written Records",
      cite: "718.111(12)(a)18",
      retention: "As applicable",
      desc: "All other written records related to the operation of the association not otherwise categorized.",
      keywords: ["correspondence", "letter", "memo", "notice", "violation", "architectural", "general"],
    },
  ];

  const HOA_CATEGORIES = [
    {
      id: "governing",
      name: "Governing Documents",
      cite: "720.303(4)(a)–(b)",
      retention: "Permanent",
      desc: "Recorded declaration of covenants, articles of incorporation, bylaws, and all amendments.",
      keywords: ["declaration", "covenant", "bylaw", "by-law", "articles", "incorporation", "amendment", "governing"],
    },
    {
      id: "plans",
      name: "Plats, Plans & Standards",
      cite: "720.303(4)(a) & (l)",
      retention: "Permanent",
      desc: "Recorded plats, plans, and the current copy of any construction or architectural standards.",
      keywords: ["plat", "plan", "survey", "architectural", "construction standard", "arb", "design guideline", "developer"],
    },
    {
      id: "rules",
      name: "Rules & Regulations",
      cite: "720.303(4)(c)",
      retention: "Current",
      desc: "The current rules and regulations of the association.",
      keywords: ["rules", "regulation", "policy", "restriction"],
    },
    {
      id: "minutes",
      name: "Meeting Minutes",
      cite: "720.303(4)(d)",
      retention: "7 years",
      desc: "Minutes of all meetings of the board and of the members.",
      keywords: ["minutes", "meeting", "agenda", "board meeting", "membership meeting", "annual meeting"],
    },
    {
      id: "membership",
      name: "Membership & Parcel Roster",
      cite: "720.303(4)(e)",
      retention: "Current",
      desc: "Current roster of members, their mailing addresses, and parcel identifications.",
      keywords: ["roster", "directory", "owner list", "membership list", "parcel", "member list"],
    },
    {
      id: "insurance",
      name: "Insurance Policies",
      cite: "720.303(4)(f)",
      retention: "Current",
      desc: "Current insurance policies of the association.",
      keywords: ["insurance", "policy", "coverage", "claim", "declarations page", "certificate of insurance", "liability"],
    },
    {
      id: "contracts",
      name: "Contracts, Leases & Bids",
      cite: "720.303(4)(g) & (m)",
      retention: "7 yrs (bids 1 yr)",
      desc: "Management agreements, leases, contracts for work, and bids for materials, equipment, or services.",
      keywords: ["contract", "agreement", "lease", "management agreement", "bid", "proposal", "vendor", "service", "scope of work"],
    },
    {
      id: "financial",
      name: "Accounting & Financial Records",
      cite: "720.303(4)(j)",
      retention: "7 years",
      desc: "Accounting records: accounts, invoices, receipts, ledgers, budgets, financial reports, and tax returns.",
      keywords: ["budget", "invoice", "receipt", "ledger", "financial", "balance sheet", "income", "expense", "tax return", "audit", "assessment", "reserve", "bank statement", "account"],
    },
    {
      id: "elections",
      name: "Ballots, Sign-in Sheets & Proxies",
      cite: "720.303(4)(k)",
      retention: "1 year",
      desc: "Ballots, sign-in sheets, voting proxies, and election materials.",
      keywords: ["ballot", "proxy", "election", "sign-in", "sign in sheet", "voting", "candidate"],
    },
    {
      id: "other",
      name: "Other Written Records",
      cite: "720.303(4)(n)",
      retention: "As applicable",
      desc: "All other records that pertain to the operation of the association.",
      keywords: ["correspondence", "letter", "memo", "notice", "violation", "general"],
    },
  ];

  /* ----------------------------------------------------------------------
   * 2. PROTECTED / NON-ACCESSIBLE RECORDS
   *    Categories the association must NOT disclose to a requesting owner.
   *    Used to auto-flag uploads for legal review before anything is shared,
   *    and to build the "withheld" column of the condominium checklist.
   * -------------------------------------------------------------------- */

  const CONDO_PROTECTED = [
    { id: "attorney", label: "Attorney-client privileged / work product", cite: "718.111(12)(c)1" },
    { id: "transfer", label: "Records obtained in approving a lease, sale, or transfer", cite: "718.111(12)(c)2" },
    { id: "personnel", label: "Employee personnel records (except compensation)", cite: "718.111(12)(c)3" },
    { id: "medical", label: "Medical records of unit owners", cite: "718.111(12)(c)4" },
    { id: "identity", label: "SSNs, driver license, and credit/debit card numbers", cite: "718.111(12)(c)5" },
    { id: "contact", label: "Owner telephone numbers, emergency contacts & opt-out addresses", cite: "718.111(12)(c)5" },
    { id: "security", label: "Electronic security measures, passwords & software", cite: "718.111(12)(c)6–7" },
  ];

  const HOA_PROTECTED = [
    { id: "attorney", label: "Attorney-client privileged / work product", cite: "720.303(5)(c)1" },
    { id: "transfer", label: "Records obtained in approving a sale, lease, or transfer", cite: "720.303(5)(c)2" },
    { id: "personnel", label: "Employee personnel records (except compensation)", cite: "720.303(5)(c)3" },
    { id: "medical", label: "Medical records of parcel owners", cite: "720.303(5)(c)4" },
    { id: "identity", label: "SSNs, driver license, and credit/debit card numbers", cite: "720.303(5)(c)5" },
    { id: "contact", label: "Owner telephone numbers, emails & opt-out addresses", cite: "720.303(5)(c)6" },
    { id: "security", label: "Electronic security measures, passwords & software", cite: "720.303(5)(c)7" },
  ];

  /* ----------------------------------------------------------------------
   * 3. SENSITIVE-INFORMATION DETECTORS
   *    Regex + keyword heuristics that stand in for the AI redaction model.
   *    Each returns match objects {kind, sample} so the review queue can
   *    show WHY a document was flagged. In production these are the signals
   *    an LLM/vision pipeline would surface for human confirmation.
   * -------------------------------------------------------------------- */

  const DETECTORS = [
    {
      id: "ssn",
      label: "Social Security Number",
      severity: "high",
      test: (t) => matchAll(t, /\b\d{3}-\d{2}-\d{4}\b/g),
    },
    {
      id: "bank",
      label: "Bank account / routing number",
      severity: "high",
      // ABA routing (9 digits) or a labeled account number.
      test: (t) =>
        matchAll(t, /\b(?:routing|aba|acct|account)\s*(?:#|no\.?|number)?\s*[:#]?\s*\d{6,17}\b/gi).concat(
          matchAll(t, /\b\d{9}\b/g).filter((m) => /rout/i.test(context(t, m)))
        ),
    },
    {
      id: "card",
      label: "Credit / debit card number",
      severity: "high",
      test: (t) => matchAll(t, /\b(?:\d[ -]?){13,16}\b/g).filter((m) => luhn(m.replace(/[ -]/g, ""))),
    },
    {
      id: "dl",
      label: "Driver license number",
      severity: "medium",
      // Florida DL: one letter followed by 12 digits (often dash-grouped).
      test: (t) => matchAll(t, /\b[A-Z]\d{3}-?\d{3}-?\d{2}-?\d{3}-?\d\b/g),
    },
    {
      id: "phi",
      label: "Protected health information (PHI)",
      severity: "high",
      test: (t) =>
        keywordHits(t, [
          "diagnosis", "prognosis", "prescription", "medication", "hipaa", "patient",
          "medical record", "disability", "health condition", "treatment", "physician",
          "ada accommodation", "emotional support animal", "esa letter",
        ]),
    },
    {
      id: "contact",
      label: "Personal contact information",
      severity: "low",
      test: (t) =>
        matchAll(t, /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g).concat(
          matchAll(t, /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g)
        ),
    },
    {
      id: "dob",
      label: "Date of birth",
      severity: "medium",
      test: (t) => keywordHits(t, ["date of birth", "dob", "born on", "d.o.b"]),
    },
  ];

  /* ----------------------------------------------------------------------
   * 4. STATUTORY DEADLINES & PENALTIES  (surfaced across the site)
   * -------------------------------------------------------------------- */

  const RULES = {
    condo: {
      label: "Condominium Association",
      chapter: "Chapter 718 — Florida Condominium Act",
      deadline: "within 10 working days of a written request",
      deadlineCite: "718.111(12)(c)",
      location: "within the county, or within 45 miles of the condominium property",
      presumption: "Failure to provide access within 10 working days creates a rebuttable presumption of willful noncompliance.",
      penalty: "Minimum damages of $50/day for up to 10 days ($500), plus the prevailing owner's attorney's fees.",
      penaltyCite: "718.111(12)(c)",
      checklistRequired: true,
      checklistRule:
        "Effective 2024, the association must provide the requestor a checklist of the records made available AND those withheld, and retain that checklist for 7 years.",
      checklistCite: "718.111(12)(c)–(g)",
    },
    hoa: {
      label: "Homeowners Association",
      chapter: "Chapter 720 — Florida Homeowners' Association Act",
      deadline: "within 10 business days of a written request",
      deadlineCite: "720.303(5)(a)",
      location: "within 45 miles of the community or within the county",
      presumption: "Failure to provide access within 10 business days creates a rebuttable presumption of willful noncompliance.",
      penalty: "Minimum damages of $50/day for up to 10 days ($500), plus the prevailing member's attorney's fees.",
      penaltyCite: "720.303(5)(b)",
      checklistRequired: false,
      checklistRule:
        "Chapter 720 does not mandate a records checklist, but our system produces one for every request as a best practice and audit trail.",
      checklistCite: "720.303(5)",
    },
  };

  /* ----------------------------------------------------------------------
   * Helpers
   * -------------------------------------------------------------------- */

  function matchAll(text, re) {
    const out = [];
    let m;
    if (!text) return out;
    while ((m = re.exec(text)) !== null) {
      out.push(m[0]);
      if (m.index === re.lastIndex) re.lastIndex++; // avoid zero-width loops
    }
    return out;
  }

  function context(text, sample) {
    const i = text.indexOf(sample);
    return i < 0 ? "" : text.slice(Math.max(0, i - 20), i);
  }

  function luhn(num) {
    let sum = 0, alt = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let d = parseInt(num.charAt(i), 10);
      if (alt) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
      alt = !alt;
    }
    return num.length >= 13 && sum % 10 === 0;
  }

  function keywordHits(text, words) {
    if (!text) return [];
    const low = text.toLowerCase();
    return words.filter((w) => low.includes(w));
  }

  /**
   * categorize(name, text, type) -> {id, name, score}
   * Scores every category by keyword hits in the filename and any extracted
   * text, returning the best match (falls back to "other").
   */
  function categorize(name, text, type) {
    const cats = type === "condo" ? CONDO_CATEGORIES : HOA_CATEGORIES;
    const hay = ((name || "") + " " + (text || "")).toLowerCase();
    let best = null, bestScore = 0;
    for (const c of cats) {
      let score = 0;
      for (const kw of c.keywords) {
        if (hay.includes(kw)) score += kw.length > 6 ? 2 : 1; // longer keywords weigh more
      }
      if (score > bestScore) { bestScore = score; best = c; }
    }
    const chosen = best || cats.find((c) => c.id === "other") || cats[cats.length - 1];
    return { id: chosen.id, name: chosen.name, cite: chosen.cite, score: bestScore };
  }

  /**
   * scan(text) -> [{id, label, severity, count, samples}]
   * Runs every sensitive-info detector over extracted text.
   */
  function scan(text) {
    const findings = [];
    for (const d of DETECTORS) {
      const hits = d.test(text || "");
      if (hits.length) {
        findings.push({
          id: d.id,
          label: d.label,
          severity: d.severity,
          count: hits.length,
          samples: dedupe(hits).slice(0, 3).map(mask),
        });
      }
    }
    return findings;
  }

  function dedupe(arr) { return Array.from(new Set(arr)); }

  // Mask everything but the last 2–4 chars so the queue never re-exposes PII.
  function mask(s) {
    s = String(s);
    if (s.includes("@")) {
      const [u, dom] = s.split("@");
      return u.slice(0, 1) + "•••@" + dom;
    }
    if (s.length <= 4) return "••";
    return "•••• " + s.replace(/\s/g, "").slice(-4);
  }

  function categoriesFor(type) { return type === "condo" ? CONDO_CATEGORIES : HOA_CATEGORIES; }
  function protectedFor(type) { return type === "condo" ? CONDO_PROTECTED : HOA_PROTECTED; }
  function rulesFor(type) { return type === "condo" ? RULES.condo : RULES.hoa; }

  return {
    CONDO_CATEGORIES, HOA_CATEGORIES,
    CONDO_PROTECTED, HOA_PROTECTED,
    DETECTORS, RULES,
    categorize, scan, categoriesFor, protectedFor, rulesFor, mask,
  };
})();
