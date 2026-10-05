#!/usr/bin/env bash
# corpus-recall: mirror yubi-OS/knowledge and build a one-line-per-doc index.
# Usage: recall.sh [target-dir]   (default: ./knowledge-mirror)
# Output: <dir>/repo/knowledge/<ref>/*.md  +  <dir>/index.tsv (corpus<TAB>doc<TAB>title)
set -euo pipefail
DIR="${1:-./knowledge-mirror}"
mkdir -p "$DIR"
curl -sL "https://codeload.github.com/yubi-OS/knowledge/tar.gz/refs/heads/main" -o "$DIR/knowledge.tar.gz"
rm -rf "$DIR/repo"
mkdir -p "$DIR/repo"
tar xzf "$DIR/knowledge.tar.gz" -C "$DIR/repo" --strip-components=1
: > "$DIR/index.tsv"
find "$DIR/repo/knowledge" -mindepth 2 -maxdepth 2 -name '*.md' | sort | while read -r f; do
  rel="${f#"$DIR/repo/"}"
  corpus="$(basename "$(dirname "$f")")"
  title="$(sed -n '1{s/^# *//;p;}' "$f")"
  printf '%s\t%s\t%s\n' "$corpus" "$rel" "$title" >> "$DIR/index.tsv"
done
echo "mirrored $(wc -l < "$DIR/index.tsv") docs into $DIR/repo"
echo "grep:    rg -i 'pattern' $DIR/repo/knowledge"
echo "index:   rg 'pattern' $DIR/index.tsv"
