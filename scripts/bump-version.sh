#!/bin/bash
set -euo pipefail

BUMP="${1:-}"

if [[ "$BUMP" != "major" && "$BUMP" != "minor" && "$BUMP" != "patch" ]]; then
  echo "Usage: yarn bump <major|minor|patch>"
  exit 1
fi

yarn version --"$BUMP" --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
NEW_VERSION="${NEW_VERSION#v}"

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('server/package.json', 'utf8'));
pkg.version = '${NEW_VERSION}';
fs.writeFileSync('server/package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo "Bumped to ${NEW_VERSION}"

git add package.json server/package.json
git commit -m "${NEW_VERSION}"
git push origin master
yarn ghtag
yarn tag:push
