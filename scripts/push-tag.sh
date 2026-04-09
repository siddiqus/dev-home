#!/bin/bash
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"

if ! git rev-parse "${TAG}" >/dev/null 2>&1; then
  echo "Error: Tag ${TAG} does not exist locally. Run 'yarn ghtag' first."
  exit 1
fi

echo "Pushing tag: ${TAG}"
git push origin "${TAG}"
echo "Pushed ${TAG} successfully."
