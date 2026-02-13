#!/bin/bash
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: ./scripts/tag-release.sh v1.4.3"
  exit 1
fi

TAG="$1"
VERSION="${TAG#v}"  # v1.4.3 -> 1.4.3

# Validate semver format
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: Invalid version format '$VERSION'. Expected: X.Y.Z"
  exit 1
fi

echo "Bumping all packages to $VERSION..."

# Update all Node.js packages (packages/* and packages/adapters/*)
pnpm -r exec -- npm version "$VERSION" --no-git-tag-version

# Update Python SDK version in pyproject.toml
if [ -f python-sdk/pyproject.toml ]; then
  sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" python-sdk/pyproject.toml
  echo "Updated python-sdk/pyproject.toml to $VERSION"
fi

# Stage all version changes
git add packages/*/package.json packages/adapters/*/package.json python-sdk/pyproject.toml

# Commit and tag
git commit -m "chore: bump version to $VERSION"
git tag "$TAG"

echo ""
echo "Done: package.json + pyproject.toml -> $VERSION, tag -> $TAG"
echo "To push: git push && git push origin $TAG"
