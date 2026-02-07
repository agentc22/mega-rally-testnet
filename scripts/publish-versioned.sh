#!/usr/bin/env bash
set -euo pipefail

BUILD_ID=${1:-$(date -u +%Y%m%d%H%M%S)}

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$REPO_ROOT"

# Build with base path under /mega-rally-testnet/v/<id>
cd web
npm ci
export NEXT_PUBLIC_BASE_PATH="/mega-rally-testnet/v/$BUILD_ID"
npm run build
cd "$REPO_ROOT"

mkdir -p "docs/v/$BUILD_ID"
rsync -av --delete web/out/ "docs/v/$BUILD_ID/"
# keep a root-level _next/static bucket for old cached HTML (optional) but versioned build is self-contained.

# redirect root -> latest version
cat > docs/index.html <<EOT
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MegaRally Testnet</title>
    <meta http-equiv="refresh" content="0; url=./v/$BUILD_ID/" />
    <link rel="canonical" href="./v/$BUILD_ID/" />
    <script>
      (function () {
        var target = './v/$BUILD_ID/';
        var suffix = (window.location.search || '') + (window.location.hash || '');
        window.location.replace(target + suffix);
      })();
    </script>
  </head>
  <body>
    <p>Redirecting…</p>
    <p><a href="./v/$BUILD_ID/">Open testnet</a></p>
  </body>
</html>
EOT

cat > docs/404.html <<EOT
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MegaRally Testnet</title>
    <meta http-equiv="refresh" content="0; url=./v/$BUILD_ID/" />
    <script>
      (function () {
        var target = './v/$BUILD_ID/';
        var suffix = (window.location.search || '') + (window.location.hash || '');
        window.location.replace(target + suffix);
      })();
    </script>
  </head>
  <body>
    <p>Redirecting…</p>
    <p><a href="./v/$BUILD_ID/">Open testnet</a></p>
  </body>
</html>
EOT

touch docs/.nojekyll

echo "$BUILD_ID" > docs/latest.txt

echo "Published buildId=$BUILD_ID"
