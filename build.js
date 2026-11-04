/*
  Fave Figs site builder
  ----------------------
  Netlify runs this automatically every time something changes.
  It copies the site files, turns every blog post (written in the editor,
  saved in content/blog/, plus any .md post files at the top level) into
  its own web page, and makes the blog list,
  posts.json (for the home page) and sitemap.xml.

  You shouldn't need to edit this file.
*/
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { marked } = require("marked");

const SITE_URL = "https://favefigs.com";
const SITE_NAME = "Fave Figs.";
const USE_IMAGE_CDN = !process.env.NO_IMAGE_CDN; // Netlify resizes uploaded photos so they load fast on phones

const ROOT = __dirname;
const OUT = path.join(ROOT, "dist");

// ---------- helpers ----------
const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, entry.name), b = path.join(to, entry.name);
    entry.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}

function writeFile(rel, content) {
  const full = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

// Sized image address (local uploads go through Netlify's image resizer)
function img(src, width) {
  if (!src) return "";
  if (/^https?:\/\//i.test(src) || !USE_IMAGE_CDN) return src;
  return `/.netlify/images?url=${encodeURIComponent(src)}&w=${width}`;
}
const abs = (u) => (!u ? "" : /^https?:/i.test(u) ? u : SITE_URL + u);

function toDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt) ? null : dt;
}
const niceDate = (dt) => dt
  ? dt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
  : "";
const isoDate = (dt) => (dt ? dt.toISOString().slice(0, 10) : "");

function plainText(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
}
function clip(text, n) {
  return text.length > n ? text.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : text;
}

// A line that's only an Instagram post link becomes the embedded post
function instagramEmbeds(md) {
  return md.replace(
    /^\s*<?(https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reel|tv)\/([\w-]+)\/?[^\s>]*)>?\s*$/gim,
    (_m, _u, kind, id) =>
      `\n<div class="ig-embed"><iframe src="https://www.instagram.com/${kind.toLowerCase()}/${id}/embed" title="Instagram post" loading="lazy" allowtransparency="true"></iframe></div>\n`
  );
}

function renderBody(md) {
  let html = marked.parse(instagramEmbeds(md || ""));
  // Resize uploaded photos and lazy-load them
  html = html.replace(/<img src="([^"]+)"/g, (_m, src) => `<img loading="lazy" src="${img(src, 1400)}"`);
  // Links to other websites open in a new tab
  html = html.replace(/<a href="(https?:\/\/[^"]+)"/g, (m, href) =>
    href.startsWith(SITE_URL) ? m : `<a href="${href}" target="_blank" rel="noopener"`);
  return html;
}

// ---------- shared page parts ----------
function head({ title, description, url, image, type = "website", extra = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#FDE21A">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:type" content="${type}">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="Fave Figs. Blog" href="${SITE_URL}/blog/feed.xml">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Figtree:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
${extra}
</head>
<body>
<div class="blog-page">
  <header class="blog-top">
    <a class="home-link" href="/">
      <img src="/logo.jpg" alt="">
      Fave Figs.
    </a>
    <a class="chip" href="/">Shop the faves</a>
  </header>
  <main>
`;
}

const foot = `  </main>
  <footer>
    <span>© <span id="year"></span> Fave Figs.</span>
    <nav aria-label="Contact">
      <a href="/">Shop</a>
      <a href="/blog/">Blog</a>
      <a data-link="instagram" href="https://www.instagram.com/fave_figs" target="_blank" rel="noopener">Instagram</a>
      <a id="emailLink" href="#">Email</a>
    </nav>
  </footer>
  <p class="credit"><a href="https://stickerbookcollective.com" target="_blank" rel="noopener">Designed by Stickerbook Collective, LLC. 2026</a></p>
</div>
<script src="/settings.js"></script>
<script>
document.querySelectorAll("[data-link]").forEach(a => { if (SITE[a.dataset.link]) a.href = SITE[a.dataset.link]; });
const emailLink = document.getElementById("emailLink");
if (SITE.email) emailLink.href = "mailto:" + SITE.email; else emailLink.remove();
document.getElementById("year").textContent = new Date().getFullYear();
</script>
</body>
</html>
`;

// ---------- read posts ----------
function postFiles() {
  const list = [];
  const dir = path.join(ROOT, "content", "blog");
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".md")) list.push(path.join(dir, f));
  }
  // Posts uploaded straight to the top level also count (README.md doesn't)
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith(".md") && f.toLowerCase() !== "readme.md") list.push(path.join(ROOT, f));
  }
  return list;
}

function readPosts() {
  return postFiles()
    .map((full) => {
      const file = path.basename(full);
      const { data, content } = matter(fs.readFileSync(full, "utf8"));
      if (data.draft === true) return null;
      const slug = file.replace(/\.md$/, "");
      const html = renderBody(content);
      const date = toDate(data.date);
      const seo = data.seo || {};
      const summary = (data.summary || "").trim() || clip(plainText(html), 160);
      return {
        slug,
        url: `/blog/${slug}/`,
        title: data.title || slug,
        date,
        cover: data.cover || "",
        coverAlt: data.cover_alt || "",
        summary,
        seoTitle: (seo.title || "").trim(),
        seoDescription: (seo.description || "").trim() || clip(summary, 160),
        html,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.date || 0) - (a.date || 0));
}

// ---------- new arrivals (from the editor's listings.json) ----------
function readListings() {
  const file = path.join(ROOT, "listings.json");
  if (!fs.existsSync(file)) return [];
  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error("listings.json couldn't be read:", e.message); return []; }
  return (data.items || [])
    .filter((it) => it && it.title && it.show !== false)
    .map((it, n) => {
      const dt = toDate(it.date);
      return {
        title: it.title,
        type: it.type || "",
        date: isoDate(dt),
        description: it.description || "",
        link: it.link || "",
        image: it.photo ? img(it.photo, 1000) : "",
        alt: it.photo_alt || it.title,
        _t: dt ? dt.getTime() : -Infinity,
        _n: n,
      };
    })
    .sort((a, b) => b._t - a._t || a._n - b._n)
    .map(({ _t, _n, ...rest }) => rest);
}

// Same card the home page script makes, built right into the page for Google
function arrivalCard(it) {
  const tag = it.type ? "New " + it.type.toLowerCase() : "New arrival";
  const date = it.date ? niceDate(toDate(it.date)).replace(/, \d{4}$/, "") : "";
  return `<article class="spot">
          <div class="spot-media">${it.image
            ? `<img src="${esc(it.image)}" alt="${esc(it.alt)}" loading="lazy">`
            : `<img class="placeholder" src="logo.jpg" alt="">`}</div>
          <div class="spot-body">
            <div class="spot-meta"><span class="pill">${esc(tag)}</span><span class="d">${esc(date)}</span></div>
            <h3>${esc(it.title)}</h3>${it.description ? `<p>${esc(it.description)}</p>` : "<p></p>"}
            ${it.link ? `<a class="btn" href="${esc(it.link)}" target="_blank" rel="noopener">Shop this fave</a>` : ""}
          </div>
        </article>`;
}

// ---------- pages ----------
function postPage(p) {
  const url = SITE_URL + p.url;
  const image = p.cover ? abs(img(p.cover, 1200)) : `${SITE_URL}/share.jpg`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.seoDescription,
    image: [image],
    datePublished: isoDate(p.date) || undefined,
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: "Fave Figs", url: SITE_URL + "/" },
    publisher: { "@type": "Organization", name: "Fave Figs", logo: { "@type": "ImageObject", url: SITE_URL + "/logo.jpg" } },
  };
  const extra = [
    p.date ? `<meta property="article:published_time" content="${isoDate(p.date)}">` : "",
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
  ].join("\n");

  return head({
    title: p.seoTitle || `${p.title} | Fave Figs. Blog`,
    description: p.seoDescription,
    url, image, type: "article", extra,
  }) + `
    <article>
      <a class="chip back-chip" href="/blog/">All posts</a>
      ${p.cover ? `<div class="post-cover"><img src="${esc(img(p.cover, 1400))}" alt="${esc(p.coverAlt)}"></div>` : ""}
      <h1 class="post-title">${esc(p.title)}</h1>
      ${p.date ? `<time class="pill post-pill" datetime="${isoDate(p.date)}">${niceDate(p.date)}</time>` : ""}
      <div class="post-body">
${p.html}
      </div>
      <a class="btn" href="/blog/" style="margin-top:12px">More posts</a>
    </article>
` + foot;
}

function listPage(posts) {
  const cards = posts.length
    ? posts.map((p) => `
      <a class="post-card${p.cover ? " has-media" : ""}" href="${p.url}">
        ${p.cover ? `<div class="media"><img src="${esc(img(p.cover, 800))}" alt="${esc(p.coverAlt)}" loading="lazy"></div>` : ""}
        <div class="body">
          ${p.date ? `<span class="pill post-pill">${niceDate(p.date)}</span>` : ""}
          <h2>${esc(p.title)}</h2>
          ${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
          <span class="brick-btn">Read post</span>
        </div>
      </a>`).join("")
    : `<p class="notice">The first post is on its way. Follow <a href="https://www.instagram.com/fave_figs" target="_blank" rel="noopener">@fave_figs</a> on Instagram in the meantime.</p>`;

  return head({
    title: "Blog | Fave Figs.",
    description: "News and notes from Fave Figs: new finds, collecting tips, and what’s coming to the shop.",
    url: `${SITE_URL}/blog/`,
    image: `${SITE_URL}/share.jpg`,
  }) + `
    <section>
      <div class="blog-banner">
        <h1 class="blog-title">Blog</h1>
        <p class="lede">News and notes from Fave Figs.</p>
      </div>
      <div id="postList">${cards}
      </div>
    </section>
` + foot;
}

function sitemap(posts) {
  const urls = [
    { loc: `${SITE_URL}/`, freq: "daily", pri: "1.0" },
    { loc: `${SITE_URL}/blog/`, freq: "weekly", pri: "0.8" },
    ...posts.map((p) => ({ loc: SITE_URL + p.url, lastmod: isoDate(p.date), freq: "monthly", pri: "0.6" })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join("\n")}
</urlset>
`;
}

function feed(posts) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Fave Figs. Blog</title>
  <link>${SITE_URL}/blog/</link>
  <description>News and notes from Fave Figs.</description>
${posts.slice(0, 20).map((p) => `  <item>
    <title>${esc(p.title)}</title>
    <link>${SITE_URL}${p.url}</link>
    <guid>${SITE_URL}${p.url}</guid>
    ${p.date ? `<pubDate>${p.date.toUTCString()}</pubDate>` : ""}
    <description>${esc(p.summary)}</description>
  </item>`).join("\n")}
</channel>
</rss>
`;
}

// ---------- build ----------
// Safety check: if key files are missing, stop so the live site stays up.
for (const must of ["index.html", "styles.css", "settings.js", "admin.html", "config.yml"]) {
  if (!fs.existsSync(path.join(ROOT, must))) {
    console.error(`\nMISSING FILE: ${must}\nUpload ${must} to GitHub, then deploy again.\n`);
    process.exit(1);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Copy the website files from the top level (skip the behind-the-scenes ones)
const PUBLIC_TYPES = /\.(html|css|js|jpe?g|png|gif|webp|svg|ico|mp4|webm|pdf|txt|xml|json|woff2?)$/i;
const SKIP = new Set(["build.js", "package.json", "package-lock.json", "admin.html", "listings.json"]);
for (const f of fs.readdirSync(ROOT)) {
  const full = path.join(ROOT, f);
  if (!fs.statSync(full).isFile() || SKIP.has(f) || f.startsWith(".") || !PUBLIC_TYPES.test(f)) continue;
  fs.copyFileSync(full, path.join(OUT, f));
}

// The blog editor lives at /admin
fs.mkdirSync(path.join(OUT, "admin"), { recursive: true });
fs.copyFileSync(path.join(ROOT, "admin.html"), path.join(OUT, "admin", "index.html"));
fs.copyFileSync(path.join(ROOT, "config.yml"), path.join(OUT, "admin", "config.yml"));

// Photos uploaded in the editor
copyDir(path.join(ROOT, "images"), path.join(OUT, "images"));

const posts = readPosts();
for (const p of posts) writeFile(`blog/${p.slug}/index.html`, postPage(p));
writeFile("blog/index.html", listPage(posts));
writeFile("blog/feed.xml", feed(posts));
writeFile("posts.json", JSON.stringify(posts.map((p) => ({
  title: p.title, url: p.url, date: isoDate(p.date), summary: p.summary,
  image: p.cover ? img(p.cover, 600) : "",
})), null, 2));
writeFile("sitemap.xml", sitemap(posts));

const arrivals = readListings();
writeFile("arrivals.json", JSON.stringify(arrivals, null, 2));
const homeFile = path.join(OUT, "index.html");
const home = fs.readFileSync(homeFile, "utf8");
const TRACK = '<div class="spot-track" id="spotTrack" tabindex="0" aria-label="Newest arrivals">';
if (home.includes(TRACK + "</div>") && arrivals.length) {
  fs.writeFileSync(homeFile, home.replace(TRACK + "</div>",
    TRACK + "\n        " + arrivals.slice(0, 50).map(arrivalCard).join("\n        ") + "\n      </div>"));
}
writeFile("robots.txt", `User-agent: *\nAllow: /\nDisallow: /thanks.html\nDisallow: /admin/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Built ${posts.length} blog post(s) and ${arrivals.length} new arrival(s) into /dist`);
