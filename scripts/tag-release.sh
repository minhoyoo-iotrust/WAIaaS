#!/bin/bash
# DEPRECATED: This script has been replaced by release-please.
# See .github/workflows/release-please.yml
#
# Release flow (2-gate model):
#   1. Merge PRs with Conventional Commits (feat:, fix:, etc.)
#   2. release-please auto-creates Release PR
#   3. Gate 1: Merge Release PR → CHANGELOG + GitHub Release + tag
#   4. Gate 2: release.yml quality gate → manual deploy approval
#
# Original script archived below for reference.

echo "ERROR: tag-release.sh is DEPRECATED since v1.8.1"
echo ""
echo "Release management is now handled by release-please."
echo "See: .github/workflows/release-please.yml"
echo ""
echo "Release flow:"
echo "  1. Merge PRs with Conventional Commits (feat:, fix:, BREAKING CHANGE:)"
echo "  2. release-please auto-creates/updates Release PR"
echo "  3. Merge Release PR when ready to release (Gate 1)"
echo "  4. Quality gate runs, then approve deploy (Gate 2)"
exit 1

# --- ARCHIVED ORIGINAL SCRIPT ---
# The following was the original tag-release.sh before deprecation.
# Kept for historical reference only.
#
# TAG="$1"
# VERSION="${TAG#v}"
# pnpm -r exec -- npm version "$VERSION" --no-git-tag-version
# if [ -f python-sdk/pyproject.toml ]; then
#   sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" python-sdk/pyproject.toml
# fi
# git add packages/*/package.json packages/adapters/*/package.json python-sdk/pyproject.toml
# git commit -m "chore: bump version to $VERSION"
# git tag "$TAG"
