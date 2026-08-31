#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: $0 <r2-bucket> <routing-directory> <remote-prefix>" >&2
  exit 64
fi

bucket="$1"
routing_directory="$2"
remote_prefix="${3%/}"

if [ ! -d "$routing_directory" ]; then
  echo "routing directory does not exist: $routing_directory" >&2
  exit 66
fi

while IFS= read -r -d '' file; do
  relative_path="${file#"$routing_directory"/}"
  npx wrangler r2 object put "$bucket/$remote_prefix/$relative_path" \
    --file="$file" \
    --remote \
    --content-type="application/octet-stream" \
    --cache-control="public, max-age=31536000, immutable"
done < <(find "$routing_directory" -type f -name '*.gph' -print0)

manifest="$routing_directory/manifest.json"
if [ -f "$manifest" ]; then
  npx wrangler r2 object put "$bucket/$remote_prefix/manifest.json" \
    --file="$manifest" \
    --remote \
    --content-type="application/json" \
    --cache-control="public, max-age=60, must-revalidate"
fi
