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

echo "Bumped to ${NEW_VERSION}"

git add package.json
git commit -m "${NEW_VERSION}"
git push origin master
yarn ghtag
yarn tag:push
