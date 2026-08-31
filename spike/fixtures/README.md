# Guangzhou mini graph fixture

This synthetic OSM fixture is only for the Valhalla WASM Spike. It places the
existing Case A/B coordinates on a small connected road grid near Guangzhou.
It is not production map data and must not be presented as a real road map.

The expected generated artifact is `guangzhou-mini-routing.tar`, served by the
Spike at `/tiles/guangzhou-mini-routing.tar`.

To regenerate it in the test environment:

```bash
docker run --rm -v "$PWD:/data" stefda/osmium-tool \
  osmium cat /data/guangzhou-mini.osm \
  -o /data/guangzhou-mini.osm.pbf --output-format=pbf
docker run --rm -v "$PWD:/custom_files" \
  --entrypoint valhalla_build_config \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest \
  --mjolnir-tile-dir /custom_files/guangzhou-mini_valhalla \
  --mjolnir-tile-extract /custom_files/guangzhou-mini_valhalla/valhalla_tiles.tar \
  > guangzhou-mini.json
docker run --rm -v "$PWD:/custom_files" \
  --entrypoint valhalla_build_tiles \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest \
  -c /custom_files/guangzhou-mini.json /custom_files/guangzhou-mini.osm.pbf
tar -cf guangzhou-mini-routing.tar -C guangzhou-mini_valhalla 1 2
```

The Spike uses the prebuilt `valhalla-wasm@0.1.0` module from source commit
`0246aee917aa4d72808d277cf560ac859c2ee227`. Its recorded build metadata is:

- Valhalla ref: `f7764b337de93530374ac90978f638734139d93b`
- vcpkg ref: `89dd0f4d241136b843fb55813b2f0fa6448c204d`
- Emscripten SDK: `6.0.0`
- Tile builder: `ghcr.io/gis-ops/docker-valhalla/valhalla:latest`

The generated tile is ignored by Git because it is a test artifact, not
production Guangzhou data.
