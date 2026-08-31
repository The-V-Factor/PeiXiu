export function createGphTileSource(tiles) {
  const totalSize = tiles.reduce((total, tile) => total + tile.bytes.byteLength, 0);
  const bytes = new Uint8Array(totalSize);
  const entries = [];
  let offset = 0;

  for (const tile of tiles) {
    bytes.set(new Uint8Array(tile.bytes), offset);
    entries.push({ name: tile.path, offset, size: tile.bytes.byteLength });
    offset += tile.bytes.byteLength;
  }

  return {
    entries,
    read(target, at, length) {
      const size = Math.max(0, Math.min(length, bytes.length - at));
      if (size > 0) target.set(bytes.subarray(at, at + size));
      return size;
    },
  };
}
