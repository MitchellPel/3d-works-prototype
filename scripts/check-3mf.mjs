import { modelXml } from "../lib/read-3mf.mjs";

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

const xml = `<model><mesh><vertices><vertex x="0" y="0" z="0"/></vertices></mesh></model>`;
const found = await modelXml(zipStored("3D/3dmodel.model", xml));
if (found !== xml) throw new Error("3mf zip was not read");
console.log("3mf ok");
