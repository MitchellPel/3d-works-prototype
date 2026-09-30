import { crc32, deflateRawSync } from "node:zlib";
import { modelXml } from "../lib/read-3mf.mjs";
import { parseBinaryStl } from "../lib/read-stl.mjs";

function zipStored(name, text) {
  const nameBytes = new TextEncoder().encode(name);
  const data = new TextEncoder().encode(text);
  const out = new Uint8Array(30 + nameBytes.length + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, nameBytes.length, true);
  out.set(nameBytes, 30);
  out.set(data, 30 + nameBytes.length);
  return out.buffer;
}

const xml = `<model><mesh><vertices><vertex x="1" y="2" z="3"/></vertices><triangles><triangle v1="0" v2="0" v3="0"/></triangles></mesh></model>`;
if ((await modelXml(zipStored("3D/3dmodel.model", xml))) !== xml) throw new Error("stored 3mf");

function zipDeflated(name, text) {
  const nameBytes = Buffer.from(name);
  const raw = Buffer.from(text);
  const packed = deflateRawSync(raw);
  const crc = crc32(raw) >>> 0;
  const local = Buffer.alloc(30 + nameBytes.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0008, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(nameBytes.length, 26);
  nameBytes.copy(local, 30);
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(packed.length, 8);
  descriptor.writeUInt32LE(raw.length, 12);
  const localOffset = 0;
  const cd = Buffer.alloc(46 + nameBytes.length);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0008, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(packed.length, 20);
  cd.writeUInt32LE(raw.length, 24);
  cd.writeUInt16LE(nameBytes.length, 28);
  cd.writeUInt32LE(localOffset, 42);
  nameBytes.copy(cd, 46);
  const cdOffset = local.length + packed.length + descriptor.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  const zip = Buffer.concat([local, packed, descriptor, cd, eocd]);
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
}

if ((await modelXml(zipDeflated("3D/3dmodel.model", xml))) !== xml) throw new Error("deflated 3mf");

const faces = 1;
const stl = new ArrayBuffer(84 + faces * 50 + 16);
const bytes = new Uint8Array(stl);
bytes.set(new TextEncoder().encode("solid exported from CAD tool"));
const stlView = new DataView(stl);
stlView.setUint32(80, faces, true);
let offset = 84 + 12;
for (const value of [0, 0, 0, 10, 0, 0, 0, 10, 5]) {
  stlView.setFloat32(offset, value, true);
  offset += 4;
}
const positions = parseBinaryStl(stl);
if (!positions || positions[3] !== 10) throw new Error("cad stl");
console.log("readers ok");
