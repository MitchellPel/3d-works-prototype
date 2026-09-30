export function parseBinaryStl(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 84) return null;
  const faces = view.getUint32(80, true);
  const need = 84 + faces * 50;
  if (faces < 1 || faces > 20_000_000 || need > buffer.byteLength) return null;
  const positions = new Float32Array(faces * 9);
  let offset = 84;
  for (let face = 0; face < faces; face++) {
    offset += 12;
    for (let value = 0; value < 9; value++) {
      positions[face * 9 + value] = view.getFloat32(offset, true);
      offset += 4;
    }
    offset += 2;
  }
  let peak = 0;
  for (let i = 0; i < positions.length; i++) peak = Math.max(peak, Math.abs(positions[i]));
  return peak === 0 ? null : positions;
}
