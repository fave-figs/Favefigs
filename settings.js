/* =====================================================================
   SITE SETTINGS — edit this file to update the site.
   (It's shared by the home page and the blog page.)
   Keep the quote marks around each value.
   ===================================================================== */
const SITE = {
  // VISITOR REPORTS (Google Analytics 4)
  // Paste your Measurement ID here, e.g. "G-ABC123XYZ". Leave blank to turn analytics off.
  googleAnalyticsId: "G-Z9T3ZYKBWK",

  // Shop + social links
  bricklink:    "https://store.bricklink.com/Nephilump#/shop?o={%22sort%22:9,%22desc%22:1,%22showHomeItems%22:0,%22showNewest%22:1}",
  ebay:         "https://ebay.com/usr/favefigs",
  brickowl:     "",   // ← paste your Brick Owl store link here when you have it
  coloringBook: "https://amzn.eu/d/0cABkXwr",   // ← swap for the amazon.com link
  instagram:    "https://www.instagram.com/fave_figs",
  email:        "favefigs@gmail.com",   // ← your contact email, e.g. "hello@favefigs.com"

  // Coloring book cover (optional): put the image file in this folder and type its name, e.g. "book.jpg"
  bookCover: "",

  // NEWEST ARRIVAL SPOTLIGHT
  // Your published Google Sheet CSV link. Figs are shown newest date first; use the arrows to scroll.
  // Sheet columns: date | title | description | image | link | type
  // type is optional: write fig, set, or bricks and the tag reads "New fig", "New set"... (blank = "New arrival")
  spotlightSheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTbj3Hn8MfzWYyFyAXG9vSiu5CfeFcKUXMv4akDfr3KZevdxufMdp8Pug83OA9_t24-fOI2gk-g9Jdc/pub?output=csv",

  // How many of the newest items to show in the scroller
  spotlightMax: 50,

  // Shown until the sheet is connected (or if the sheet can't be reached)
  spotlightFallback: {
    date: "",
    title: "Fresh faves just landed",
    description: "New minifigs and sets are added to the shop every week. Take a look at what just arrived.",
    image: "",
    link: "https://store.bricklink.com/Nephilump#/shop?o={%22sort%22:9,%22desc%22:1,%22showHomeItems%22:0,%22showNewest%22:1}"
  },

  // REVIEWS
  // Your published Google Sheet CSV link for the reviews tab. Newest date shows first.
  // Sheet columns: date | name | review | stars | where
  reviewsSheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQBrEXPuBYaimY_nNlMYAN-k0xgJZT-XiVf73QwzmV3ZaXXsrMrQPxZ7sxYRbjGP0Kj_zxnLku6F0Zy/pub?output=csv",
  reviewsMax: 12,

  // "HELLO FROM FAVE!" BUBBLE (under the shop buttons)
  // Your published Google Sheet CSV link. Columns: title | image | link
  // The first filled-in row under the headers is the one shown.
  helloSheet: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTCjf_hDA6UJQUNpiK6F8mrHRr1lNyTn6_Uffx550QWAKMDS4Wot_EleUh2WqfdAm8Fl8bhrCp74kbu/pub?output=csv",

  // BLOG
  // Blog posts are written in the editor at favefigs.com/admin (not a Google Sheet).
  blogOnHome: 2,   // how many recent posts to list on the home page (0 hides the section)
};
/* ===================== end of settings ===================== */


/* ---------- Shared helpers (no need to edit below) ---------- */

// Google Analytics: loads only when an ID is set above
(function () {
  const id = (SITE.googleAnalyticsId || "").trim();
  if (!/^G-[A-Z0-9]+$/i.test(id)) return;
  const tag = document.createElement("script");
  tag.async = true;
  tag.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
  document.head.appendChild(tag);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", id);
})();

function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Turns a Google Drive share link into a direct image link
function imageUrl(u) {
  if (!u) return "";
  u = u.trim();
  if (u.includes("drive.google.com")) {
    const m = u.match(/\/d\/([\w-]+)/) || u.match(/[?&]id=([\w-]+)/);
    if (m) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1200";
  }
  return u;
}

function niceDate(d, withYear) {
  if (!d) return "";
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);   // "2026-10-27" → that calendar day, not UTC
  const dt = ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]) : new Date(d);
  if (isNaN(dt)) return d;
  const opts = { month: "long", day: "numeric" };
  if (withYear) opts.year = "numeric";
  return dt.toLocaleDateString("en-US", opts);
}

// Reads a published Google Sheet CSV and returns rows as objects, newest date first.
// Rows missing the required column are skipped.
async function loadSheet(url, required) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("sheet " + res.status);
  const rows = parseCSV(await res.text()).filter(r => r.some(c => c.trim()));
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
  const items = rows.map((r, n) => {
    const o = { _n: n };
    head.forEach((h, i) => o[h] = (r[i] || "").trim());
    o._t = Date.parse(o.date);
    return o;
  }).filter(o => !required || o[required]);
  items.sort((x, y) => {
    const a = isNaN(x._t) ? -Infinity : x._t, b = isNaN(y._t) ? -Infinity : y._t;
    return b - a || x._n - y._n;
  });
  return items;
}

// If the link is an Instagram post or reel, returns its embed address
function instagramEmbed(u) {
  const m = (u || "").match(/instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]+)/i);
  return m ? "https://www.instagram.com/" + m[1].toLowerCase() + "/" + m[2] + "/embed" : "";
}

// Makes a web-address-friendly name for a blog post from its title
function slugify(t) {
  return (t || "post").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "post";
}
