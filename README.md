# justmazz

Source for [jmazzola.github.io](https://jmazzola.github.io), my blog. I'm an ex-cheat dev turned security engineer, and I write about reverse engineering, anti-cheat, game security, and what models are doing to all of it.

## What's on it

- Posts on reverse engineering, done the old-fashioned way and with AI in the loop, plus side projects and the occasional opinion.
- An [about page](https://jmazzola.github.io/about/) on how I went from Flash trainers and Xbox 360 mods to anti-cheat work.
- An Atom [feed](https://jmazzola.github.io/feed.xml) if you'd rather not check back.

There's also a theme picker in the header, and one theme you have to find on your own.

## How it's built

Plain [Eleventy](https://www.11ty.dev/) with Nunjucks templates, hand-written CSS, and vanilla JS. No framework, no trackers. GitHub Actions builds it and deploys it to GitHub Pages on every push to `main`. Built with help from [Claude](https://claude.ai).

To run it locally (Node.js 20+):

```sh
npm install
npm run dev    # http://localhost:8080 with live reload
npm run build  # writes the site to _site/
```

## Using what's here

The writing and my own screenshots are mine. Third-party screenshots, clips, and GIFs belong to their owners and are credited where they're used. The [terms page](https://jmazzola.github.io/terms/) covers how you can use and quote things. Fonts are self-hosted under the SIL Open Font License.

## Contact

[@justmazz](https://x.com/justmazz) on X.
