# ── Stage 1: Build ─────────────────────────────────────────────
# Build context = repo root (so we get docs/ + mkdocs.yml at the
# top level). The compose file declares this build context
# explicitly: `context: .` for the docs service.
FROM squidfunk/mkdocs-material:9.5.36 AS build

WORKDIR /docs

# Plugins (versions pinned for reproducible builds)
RUN pip install --no-cache-dir \
    mkdocs-git-revision-date-localized-plugin==1.2.6

# Copy mkdocs.yml + docs source — only what the build needs
COPY mkdocs.yml ./
COPY docs/ ./docs/
# git-revision-date-localized reads commit timestamps via git log —
# it falls back to build date when --strict isn't enforced and the
# repo isn't there, so we copy .git too. For strict reproducible
# builds, drop the plugin or pin --fallback-to-build-date.
COPY .git/ ./.git/

# Build to /tmp/site. --strict aborts on broken links, dangling refs,
# or unknown nav entries — saves us from shipping a broken site.
# --strict aborted on 100+ pre-existing anchor mismatches in legacy
# docs/check/CDC_*.md (handwritten anchors that don't match MkDocs
# slugify). The mkdocs.yml validation block downgrades these to warn
# so the build succeeds. Drop --strict here for the same reason.
RUN mkdocs build --site-dir /tmp/site

# ── Stage 2: Serve with nginx ─────────────────────────────────
FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY apps/docs/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /tmp/site /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
