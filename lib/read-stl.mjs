export function parseBinaryStl(buffer, maxFaces = 150000) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 84) return null;
  const faces = view.getUint32(80, true);
  const need = 84 + faces * 50;
  if (faces < 1 || faces > 20_000_000 || need > buffer.byteLength) return null;
  const sampledFaces = Math.min(faces, maxFaces);
  const stride = Math.max(1, Math.ceil(faces / sampledFaces));
  const positions = new Float32Array(sampledFaces * 9);
  for (let face = 0; face < sampledFaces; face++) {
    let offset = 84 + Math.min(face * stride, faces - 1) * 50;
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
