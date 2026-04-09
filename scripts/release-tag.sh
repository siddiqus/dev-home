#!/bin/bash
set -euo pipefail

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"

echo "Creating release tag: ${TAG}"

# Check if tag already exists
if git rev-parse "${TAG}" >/dev/null 2>&1; then
  echo "Error: Tag ${TAG} already exists."
  exit 1
fi

# Create annotated tag
git tag -a "${TAG}" -m "Release ${TAG}"

# Push the tag
git push origin "${TAG}"

# Create a GitHub release from the tag
gh release create "${TAG}" --title "${TAG}" --generate-notes -h github-personal

echo "Released ${TAG} successfully."
