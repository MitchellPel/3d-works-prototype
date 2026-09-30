import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateRawSync } from "node:zlib";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { parseBinaryStl } from "../lib/read-stl.mjs";

const tris = [
  [0, 0, 0, 40, 0, 0, 40, 30, 0],
  [0, 0, 0, 40, 30, 0, 0, 30, 0],
  [0, 0, 20, 40, 30, 20, 40, 0, 20],
  [0, 0, 20, 0, 30, 20, 40, 30, 20],
  [0, 0, 0, 40, 0, 20, 40, 0, 0],
  [0, 0, 0, 0, 0, 20, 40, 0, 20],
  [0, 30, 0, 40, 30, 0, 40, 30, 20],
  [0, 30, 0, 40, 30, 20, 0, 30, 20],
  [0, 0, 0, 0, 30, 0, 0, 30, 20],
  [0, 0, 0, 0, 30, 20, 0, 0, 20],
  [40, 0, 0, 40, 0, 20, 40, 30, 20],
  [40, 0, 0, 40, 30, 20, 40, 30, 0],
];

const stl = Buffer.alloc(84 + tris.length * 50 + 32);
stl.write("solid exported from CAD tool");
stl.writeUInt32LE(tris.length, 80);
let offset = 84;
for (const tri of tris) {
  offset += 12;
  for (const value of tri) {
    stl.writeFloatLE(value, offset);
    offset += 4;
  }
  offset += 2;
}
const stlBytes = stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength);
const threeCount = new STLLoader().parse(stlBytes).getAttribute("position")?.count ?? 0;
const ours = parseBinaryStl(stlBytes);
if (threeCount !== 0) throw new Error("expected three to miss this stl, got " + threeCount);
if (!ours || ours.length !== tris.length * 9) throw new Error("binary fallback missed the stl");

const obj = `o box
v 0 0 0
v 40 0 0
v 40 30 0
v 0 30 0
v 0 0 20
v 40 0 20
v 40 30 20
v 0 30 20
f 1 2 3
f 1 3 4
f 5 7 6
f 5 8 7
f 1 6 2
f 1 5 6
f 4 3 7
f 4 7 8
f 1 4 8
f 1 8 5
f 2 6 7
f 2 7 3
`;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="millimeter">
<resources><object id="1" type="model"><mesh>
<vertices>
<vertex x="0" y="0" z="0"/><vertex x="40" y="0" z="0"/><vertex x="40" y="30" z="0"/><vertex x="0" y="30" z="0"/>
<vertex x="0" y="0" z="20"/><vertex x="40" y="0" z="20"/><vertex x="40" y="30" z="20"/><vertex x="0" y="30" z="20"/>
</vertices>
<triangles>
<triangle v1="0" v2="1" v3="2"/><triangle v1="0" v2="2" v3="3"/>
<triangle v1="4" v2="6" v3="5"/><triangle v1="4" v2="7" v3="6"/>
<triangle v1="0" v2="5" v3="1"/><triangle v1="0" v2="4" v3="5"/>
<triangle v1="3" v2="2" v3="6"/><triangle v1="3" v2="6" v3="7"/>
<triangle v1="0" v2="3" v3="7"/><triangle v1="0" v2="7" v3="4"/>
<triangle v1="1" v2="5" v3="6"/><triangle v1="1" v2="6" v3="2"/>
</triangles>
</mesh></object></resources><build><item objectid="1"/></build></model>`;

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
  nameBytes.copy(cd, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(local.length + packed.length + descriptor.length, 16);
  return Buffer.concat([local, packed, descriptor, cd, eocd]);
}

mkdirSync("public/fixtures", { recursive: true });
writeFileSync("public/fixtures/cad-extra.stl", stl);
writeFileSync("public/fixtures/box.obj", obj);
writeFileSync("public/fixtures/deflated.3mf", zipDeflated("3D/3dmodel.model", xml));
console.log("fixtures ready", { threeCount, verts: ours.length / 3, stl: stl.length });
