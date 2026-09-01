#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 7 ]; then
  echo "usage: $0 <source-pbf> <routing-root> <graph-version> <west> <south> <east> <north>" >&2
  exit 64
fi

source_pbf="$1"
routing_root="$2"
graph_version="$3"
west="$4"
south="$5"
east="$6"
north="$7"

osmium_image="${OSMIUM_IMAGE:-stefda/osmium-tool}"
valhalla_image="${VALHALLA_IMAGE:-ghcr.io/gis-ops/docker-valhalla/valhalla:latest}"

if [ ! -f "$source_pbf" ]; then
  echo "source PBF does not exist: $source_pbf" >&2
  exit 66
fi

source_pbf="$(cd "$(dirname "$source_pbf")" && pwd)/$(basename "$source_pbf")"
routing_root="$(mkdir -p "$routing_root" && cd "$routing_root" && pwd)"
target_directory="$routing_root/$graph_version"

if [ -e "$target_directory" ]; then
  echo "refusing to overwrite existing graph directory: $target_directory" >&2
  exit 73
fi

work_directory="$(mktemp -d "${TMPDIR:-/tmp}/peixiu-routing.XXXXXX")"
cleanup() {
  rm -rf "$work_directory"
}
trap cleanup EXIT

source_directory="$(dirname "$source_pbf")"
source_filename="$(basename "$source_pbf")"

docker run --rm \
  -v "$source_directory:/source:ro" \
  -v "$work_directory:/data" \
  --entrypoint osmium \
  "$osmium_image" extract \
  -b "$west,$south,$east,$north" \
  --strategy complete_ways \
  "/source/$source_filename" \
  -o /data/guangzhou.osm.pbf \
  --output-format=pbf

docker run --rm \
  -v "$work_directory:/data" \
  --entrypoint valhalla_build_config \
  "$valhalla_image" \
  --mjolnir-tile-dir /data/valhalla_tiles \
  --mjolnir-tile-extract /data/valhalla_tiles/valhalla_tiles.tar \
  > "$work_directory/valhalla.json"

docker run --rm \
  -v "$work_directory:/data" \
  --entrypoint valhalla_build_tiles \
  "$valhalla_image" \
  -c /data/valhalla.json /data/guangzhou.osm.pbf

mkdir -p "$target_directory"
while IFS= read -r -d '' file; do
  relative_path="${file#"$work_directory/valhalla_tiles/"}"
  destination="$target_directory/$relative_path"
  mkdir -p "$(dirname "$destination")"
  cp "$file" "$destination"
done < <(find "$work_directory/valhalla_tiles" -type f -name '*.gph' -print0)

OSM_PBF_URL="${OSM_PBF_URL:-https://download.geofabrik.de/asia/china/guangdong-latest.osm.pbf}" \
VALHALLA_IMAGE="$valhalla_image" \
node "$(dirname "$0")/generate-manifest.mjs" \
  "$target_directory" "$graph_version" "$west" "$south" "$east" "$north" "$source_pbf"

mv "$target_directory/manifest.json" "$routing_root/manifest.json"

echo "built real Guangzhou graph: $target_directory"
