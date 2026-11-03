/*
  Fave Figs site builder
  ----------------------
  Netlify runs this automatically every time something changes.
  It copies the site files, turns every blog post written in the editor
  (content/blog/*.md) into its own web page, and makes the blog list,
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
function readPosts() {
  const dir = path.join(ROOT, "content", "blog");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const { data, content } = matter(fs.readFileSync(path.join(dir, file), "utf8"));
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
fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, "site"), OUT);
copyDir(path.join(ROOT, "admin"), path.join(OUT, "admin"));
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
writeFile("robots.txt", `User-agent: *\nAllow: /\nDisallow: /thanks.html\nDisallow: /admin/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

console.log(`Built ${posts.length} blog post(s) into /dist`);
