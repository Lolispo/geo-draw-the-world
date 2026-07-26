#!/usr/bin/env bash
# Stage the deployable static site into dist/ for the CI deploy workflow.
#
# geo is a no-build, root-served static site (data is committed, not generated
# at deploy). This mirrors what the local scripts/deploy.sh did — publish the
# repo root minus VCS/tooling/docs — but into a clean dist/ so the shared
# reusable deploy workflow (which syncs dist-dir raw with --delete) can upload
# it as-is. Everything the app fetches at runtime (css/ js/ data/ assets/ +
# index.html, favicon.svg, og-image.png, meta.json) is kept; repo cruft is not.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist
rsync -a \
  --exclude '.git' --exclude '.github' \
  --exclude '.omc' --exclude '.gstack' --exclude '.claude' --exclude '.DS_Store' \
  --exclude 'node_modules' --exclude 'dist' \
  --exclude 'scripts' --exclude 'docs' \
  --exclude '.gitignore' \
  --exclude 'package.json' --exclude 'package-lock.json' \
  --exclude 'TODO.md' --exclude 'TODO.local.md' --exclude 'README.md' --exclude 'LICENSE' \
  ./ dist/

echo "staged $(find dist -type f | wc -l | tr -d ' ') files into dist/"
