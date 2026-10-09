const fs = require("fs");
const path = require("path");
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");

module.exports = function(eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);

  // Fenced code blocks render as <details open> whose <summary> is the header
  // strip, so readers can fold a block away without JS. Add `collapsed` after
  // the language (```python collapsed) to start a block folded.
  const codeLabels = {
    js: "javascript", javascript: "javascript",
    ts: "typescript", typescript: "typescript",
    py: "python", python: "python",
    cpp: "c++", c: "c", cs: "c#", csharp: "c#",
    nasm: "asm", asm: "asm", asm6502: "asm",
    sh: "shell", bash: "shell", shell: "shell", powershell: "powershell",
    json: "json", rust: "rust", diff: "diff", llvm: "llvm ir",
    html: "html", markup: "html", css: "css",
  };
  eleventyConfig.amendLibrary("md", (md) => {
    const renderFence = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const [spec = "", ...flags] = md.utils.unescapeAll(token.info).trim().split(/\s+/);
      const lang = spec.split("/")[0]; // strip line-highlight suffix (```js/1-3)
      const label = md.utils.escapeHtml(codeLabels[lang] || lang || "text");
      const lines = token.content.split("\n").length - (token.content.endsWith("\n") ? 1 : 0);
      const open = flags.includes("collapsed") ? "" : " open";
      return `<details class="code-block"${open}>` +
        `<summary class="code-head"><span class="code-lang">${label}<span class="visually-hidden"> code</span></span>` +
        `<span class="code-toggle" data-lines="${lines} ${lines === 1 ? "line" : "lines"}" aria-hidden="true"></span></summary>` +
        renderFence(tokens, idx, options, env, self) +
        `</details>\n`;
    };

    // Wide tables scroll inside a wrapper so the <table> itself keeps normal
    // table layout and fills the column.
    md.renderer.rules.table_open = (tokens, idx, options, env, self) =>
      `<div class="table-wrap">\n` + self.renderToken(tokens, idx, options);
    md.renderer.rules.table_close = (tokens, idx, options, env, self) =>
      self.renderToken(tokens, idx, options) + `</div>\n`;

    // h2/h3 get ids so the contents rail (and anyone sharing a link) can point
    // at a section. Ids are unique per document: a repeated heading gets -2, -3.
    const slugify = eleventyConfig.getFilter("slugify");
    const takenIds = new WeakMap(); // one token array per render
    md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if ((token.tag === "h2" || token.tag === "h3") && !token.attrGet("id")) {
        let taken = takenIds.get(tokens);
        if (!taken) takenIds.set(tokens, (taken = new Set()));
        const base = slugify(tokens[idx + 1].content) || "section";
        let id = base;
        for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
        taken.add(id);
        token.attrSet("id", id);
      }
      return self.renderToken(tokens, idx, options);
    };
  });

  // src/posts is also the Obsidian vault: drafts/ holds unpublished posts and
  // .obsidian/ holds Obsidian's settings. Neither belongs on the site.
  eleventyConfig.ignores.add("src/posts/drafts/**");
  eleventyConfig.ignores.add("src/posts/.obsidian/**");

  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/img");
  eleventyConfig.addPassthroughCopy("src/CNAME");
  eleventyConfig.addPassthroughCopy("src/.nojekyll");

  // Self-hosted fonts (latin subset) with their OFL licenses, from @fontsource.
  const fonts = {
    "@fontsource-variable/azeret-mono": ["azeret-mono-latin-wght-normal.woff2", "azeret-mono-latin-wght-italic.woff2"],
    "@fontsource-variable/ibm-plex-sans": ["ibm-plex-sans-latin-wght-normal.woff2", "ibm-plex-sans-latin-wght-italic.woff2"],
    "@fontsource/ibm-plex-mono": ["ibm-plex-mono-latin-400-normal.woff2", "ibm-plex-mono-latin-400-italic.woff2", "ibm-plex-mono-latin-600-normal.woff2"],
    // only loaded by the hidden 1337 theme
    "@fontsource/vt323": ["vt323-latin-400-normal.woff2"],
    "@fontsource/press-start-2p": ["press-start-2p-latin-400-normal.woff2"],
  };
  for (const [pkg, files] of Object.entries(fonts)) {
    for (const file of files) eleventyConfig.addPassthroughCopy({ [`node_modules/${pkg}/files/${file}`]: `fonts/${file}` });
    eleventyConfig.addPassthroughCopy({ [`node_modules/${pkg}/LICENSE`]: `fonts/LICENSE-${pkg.split("/")[1]}.txt` });
  }

  eleventyConfig.addCollection("posts", function(collectionApi) {
    return collectionApi.getFilteredByGlob("src/posts/*.md").sort((a, b) => {
      return b.date - a.date;
    });
  });

  eleventyConfig.addCollection("categories", function(collectionApi) {
    const posts = collectionApi.getFilteredByGlob("src/posts/*.md");
    const cats = new Set();
    posts.forEach(post => {
      if (post.data.category) cats.add(post.data.category);
    });
    return [...cats].sort();
  });

  // Front matter dates are parsed as UTC midnight; format in UTC so a post
  // dated 2026-10-01 never renders as September 30 in western time zones.
  eleventyConfig.addFilter("dateFormat", function(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
    });
  });

  eleventyConfig.addFilter("dateShort", function(date) {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC'
    });
  });

  eleventyConfig.addFilter("isoDate", function(date) {
    return new Date(date).toISOString().slice(0, 10);
  });

  // Stable per-key pick from a list (e.g. a footer quip per page URL).
  eleventyConfig.addFilter("pickBy", function(list, key) {
    let h = 0;
    for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return list[h % list.length];
  });

  eleventyConfig.addFilter("excerpt", function(content) {
    if (!content) return '';
    const stripped = content.replace(/<[^>]+>/g, '');
    return stripped.substring(0, 200) + (stripped.length > 200 ? '...' : '');
  });

  eleventyConfig.addFilter("readingTime", function(content) {
    if (!content) return '1 min read';
    const words = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    return `${Math.max(1, Math.round(words / 220))} min read`;
  });

  // A post's sections for the contents rail: every h2 the markdown renderer
  // gave an id. Text keeps its HTML escaping, so templates print it with |safe.
  eleventyConfig.addFilter("toc", function(html) {
    const items = [];
    for (const m of String(html || "").matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)) {
      items.push({ id: m[1], text: m[2].replace(/<[^>]+>/g, "").trim() });
    }
    return items;
  });

  // Social card for a page: src/img/og/<fileSlug>.png when one exists (posts get
  // a title card), otherwise the site card. 1200x630, used by X, Discord, Telegram.
  eleventyConfig.addFilter("ogImage", function(slug) {
    const own = slug && fs.existsSync(path.join(__dirname, "src/img/og", `${slug}.png`));
    return own ? `/img/og/${slug}.png` : "/img/og/default.png";
  });

  eleventyConfig.addFilter("filterByCategory", function(posts, category) {
    if (!category) return posts;
    return posts.filter(p => p.data.category === category);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    // Markdown posts are code-heavy (C/C++ brace init, printf formats); never
    // let Nunjucks parse `{{`, `{%` or `{#` inside them.
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk"
  };
};
