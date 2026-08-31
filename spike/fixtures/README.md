# Guangzhou mini graph fixture

This synthetic OSM fixture is only for the Valhalla WASM Spike. It places the
existing Case A/B coordinates on a small connected road grid near Guangzhou.
It is not production map data and must not be presented as a real road map.

The generated source archive is `guangzhou-mini-routing.tar`. Phase 3 extracts
its individual `.gph` files into the versioned static layout under
`public/routing/guangzhou-mini/graph-2026-08-31-001/` and serves the manifest at
`/routing/guangzhou-mini/manifest.json`.

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

The generated source archive and intermediate build directory are ignored by
Git because they are test artifacts, not production Guangzhou data. The small
versioned `.gph` sample committed for Phase 3 is the static deployment fixture.

The checked-in Phase 3 manifest records the input fixture SHA-256 and the
Valhalla/WASM build references. The current OSM fixture checksum is:

```text
606b91294734551bc6be6b31d88c8da5df1b43e8f6596c3f3bb26c6224d8aad4  guangzhou-mini.osm
```

The generated PBF checksum used for the current graph is:

```text
65dbc43a31911df3e1bdf3a58d4133dcffb627d46777ad6a05ada928728d8df0  guangzhou-mini.osm.pbf
```

The versioned upload layout is suitable for R2:

```text
routing/guangzhou-mini/
  manifest.json
  graph-2026-08-31-001/
  1/040/973.gph
  2/000/652/053.gph
```

The browser fetches the manifest first, then only tile paths whose recorded
bounds intersect the route's start/end envelope. A missing tile returns an
explicit HTTP error containing its status and path.
