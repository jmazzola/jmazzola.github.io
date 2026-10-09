// Markdown is not preprocessed by Nunjucks (see markdownTemplateEngine in
// .eleventy.js), so a templated permalink string in posts.json would be
// written out literally. Compute it in JS instead: /blog/<slug>/ where the
// slug is the filename without its YYYY-MM-DD- prefix.
module.exports = {
  eleventyComputed: {
    permalink: data => `/blog/${data.page.fileSlug}/`
  }
};
