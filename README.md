# taikkyithar.github.io

Personal site and blog — a Jekyll site deployed by GitHub Pages from the `main` branch.

## Writing a post

Add a Markdown file to `_posts/` named `YYYY-MM-DD-some-slug.md`:

~~~markdown
---
layout: post
title: "Your title here"
date: 2026-07-15 09:00:00 +0630
description: "One or two sentences. Used for the card excerpt, SEO, and social previews."
tags: [linux, automation]
---

Your content in Markdown. Code fences get syntax highlighting:

```bash
echo "hello"
```
~~~

Commit and push — GitHub Pages rebuilds and the post appears automatically on:

- the homepage (the three most recent posts)
- `/blog/` (all posts, filterable by tag)
- `/feed.xml` (RSS)

Notes:

- `layout: post` is applied automatically, so it's optional.
- Tags create filter buttons on `/blog/` on their own. No registration step.
- Reading time is calculated from the word count (`words_per_minute` in `_config.yml`).
- A post dated in the future will not appear until that date passes.

## Structure

```
_config.yml          site settings, social links, permalinks
_layouts/
  default.html       page shell: nav, aurora backdrop, footer, scripts
  post.html          single post: title, meta, prose, prev/next
_includes/
  head.html          meta tags, fonts, no-flash theme script
  nav.html           navbar
  footer.html        footer
_posts/              blog posts (Markdown)
assets/
  css/main.css       all styles
  js/main.js         all behaviour
  js/uuid.js         UUID generator (loaded only on its own page)
  js/password.js     Password generator (loaded only on its own page)
index.html           homepage
blog.html            post index (/blog/)
tools.html           tools index (/tools/)
tools/
  uuid-generator.html      UUID Generator (/tools/uuid-generator/)
  password-generator.html  Password Generator (/tools/password-generator/)
```

## Adding a tool

Tools are standalone pages under `tools/` with their own `permalink`, plus a card on
`tools.html` linking to them. Page-specific JavaScript goes in its own file under
`assets/js/` and is loaded with a `<script>` tag at the bottom of that page, so it
only ships to the page that needs it.

Everything runs client-side — no build step, no API, nothing leaves the browser.

## Running locally

Requires Ruby 3.x.

```bash
bundle install
bundle exec jekyll serve --livereload
# http://localhost:4000
```

`bundle exec jekyll serve --future` also shows posts dated in the future.

## Motion

Animations are CSS-driven where possible and all of them are disabled by
`@media (prefers-reduced-motion: reduce)`. JS reads the same media query before
running the count-up, typewriter, and filter transitions, so the site stays fully
usable with motion turned off.
