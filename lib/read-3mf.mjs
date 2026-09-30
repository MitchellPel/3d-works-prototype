export async function modelXml(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocd = findEocd(bytes);
  if (eocd >= 0) {
    const count = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    for (let entry = 0; entry < count; entry++) {
      if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) break;
      const method = view.getUint16(cursor + 10, true);
      const compSize = view.getUint32(cursor + 20, true);
      const nameLen = view.getUint16(cursor + 28, true);
      const extraLen = view.getUint16(cursor + 30, true);
      const commentLen = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLen));
      if (name.toLowerCase().endsWith("3dmodel.model")) {
        return decodeEntry(bytes, view, localOffset, method, compSize);
      }
      cursor += 46 + nameLen + extraLen + commentLen;
    }
  }
  return readLocal(bytes, view);
}

function findEocd(bytes) {
  const start = Math.max(0, bytes.length - 22 - 65535);
  for (let index = bytes.length - 22; index >= start; index--) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) return index;
  }
  return -1;
}

async function readLocal(bytes, view) {
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
    if (name.toLowerCase().endsWith("3dmodel.model")) return decodeEntry(bytes, view, offset, method, compSize);
    offset += 30 + nameLen + extraLen + compSize;
  }
  return null;
}

async function decodeEntry(bytes, view, localOffset, method, compSize) {
  const nameLen = view.getUint16(localOffset + 26, true);
  const extraLen = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + nameLen + extraLen;
  const data = bytes.subarray(dataStart, dataStart + compSize);
  const raw = method === 0 ? data : method === 8 ? await inflate(data) : null;
  return raw?.length ? new TextDecoder().decode(raw) : null;
}

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
