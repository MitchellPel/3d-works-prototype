import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import type { ModelMetrics } from "./quote-engine.ts";

type Point = [number, number, number];
const MAX_TRIANGLES = 1_000_000;
const MAX_XML_BYTES = 20 * 1024 * 1024;

function numeric(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Invalid model coordinates");
  return number;
}

class Accumulator {
  min: Point = [Infinity, Infinity, Infinity];
  max: Point = [-Infinity, -Infinity, -Infinity];
  signedVolume = 0;
  faces = 0;
  edgeCounts: Map<string, number> | null = new Map();

  add(a: Point, b: Point, c: Point) {
    if (++this.faces > MAX_TRIANGLES)
      throw new Error("Model has too many triangles");
    for (const vertex of [a, b, c]) {
      for (let axis = 0; axis < 3; axis++) {
        const value = numeric(vertex[axis]);
        this.min[axis] = Math.min(this.min[axis], value);
        this.max[axis] = Math.max(this.max[axis], value);
      }
    }
    if (this.faces > 100_000) this.edgeCounts = null;
    if (this.edgeCounts) {
      const key = (point: Point) =>
        point.map((value) => Math.round(value * 1_000_000)).join(",");
      const vertices = [key(a), key(b), key(c)];
      for (let index = 0; index < 3; index++) {
        const first = vertices[index];
        const second = vertices[(index + 1) % 3];
        const edge =
          first < second ? first + "|" + second : second + "|" + first;
        this.edgeCounts.set(edge, (this.edgeCounts.get(edge) ?? 0) + 1);
      }
    }
    this.signedVolume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }

  finish(): ModelMetrics {
    if (!this.faces) throw new Error("No printable mesh found");
    const bounds = this.max.map(
      (value, axis) => value - this.min[axis],
    ) as Point;
    if (bounds.some((value) => value <= 0 || value > 2000))
      throw new Error("Model dimensions are outside the supported range");
    const boundingVolume = bounds[0] * bounds[1] * bounds[2];
    const volume = Math.abs(this.signedVolume);
    return {
      boundsMm: bounds,
      enclosedVolumeMm3:
        this.edgeCounts &&
        [...this.edgeCounts.values()].every((count) => count === 2) &&
        volume >= boundingVolume * 0.0001 &&
        volume <= boundingVolume * 1.05
          ? volume
          : null,
    };
  }
}

function parseStl(data: Uint8Array, acc: Accumulator) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length >= 84) {
    const count = view.getUint32(80, true);
    if (count > 0 && count <= MAX_TRIANGLES && 84 + count * 50 <= data.length) {
      for (let face = 0; face < count; face++) {
        const offset = 84 + face * 50 + 12;
        const points = [0, 1, 2].map((corner) =>
          [0, 1, 2].map((axis) =>
            view.getFloat32(offset + corner * 12 + axis * 4, true),
          ),
        ) as [Point, Point, Point];
        acc.add(...points);
      }
      return;
    }
  }
  const source = new TextDecoder().decode(data);
  const vertices = [
    ...source.matchAll(
      /\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g,
    ),
  ];
  if (!vertices.length || vertices.length % 3 !== 0)
    throw new Error("Invalid STL file");
  for (let index = 0; index < vertices.length; index += 3) {
    const points = vertices
      .slice(index, index + 3)
      .map((match) => [
        numeric(match[1]),
        numeric(match[2]),
        numeric(match[3]),
      ]) as [Point, Point, Point];
    acc.add(...points);
  }
}

function parseObj(data: Uint8Array, acc: Accumulator) {
  const vertices: Point[] = [];
  for (const line of new TextDecoder().decode(data).split(/\r?\n/)) {
    if (line.startsWith("v ")) {
      const values = line.trim().split(/\s+/).slice(1, 4).map(numeric);
      if (values.length === 3) vertices.push(values as Point);
    } else if (line.startsWith("f ")) {
      const ids = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((part) => {
          const index = Number(part.split("/")[0]);
          return index < 0 ? vertices.length + index : index - 1;
        });
      for (let corner = 1; corner < ids.length - 1; corner++) {
        const points = [
          vertices[ids[0]],
          vertices[ids[corner]],
          vertices[ids[corner + 1]],
        ];
        if (points.some((point) => !point)) throw new Error("Invalid OBJ face");
        acc.add(points[0], points[1], points[2]);
      }
    }
  }
}

function children(value: unknown): Record<string, unknown>[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
}

function part(object: Record<string, unknown>, name: string): unknown {
  const key = Object.keys(object).find(
    (entry) => entry.split(":").pop() === name,
  );
  return key ? object[key] : undefined;
}

function transformPoint(point: Point, source: unknown): Point {
  if (!source) return point;
  const matrix = String(source).trim().split(/\s+/).map(numeric);
  if (matrix.length !== 12) throw new Error("Invalid 3MF transform");
  const [x, y, z] = point;
  return [
    x * matrix[0] + y * matrix[3] + z * matrix[6] + matrix[9],
    x * matrix[1] + y * matrix[4] + z * matrix[7] + matrix[10],
    x * matrix[2] + y * matrix[5] + z * matrix[8] + matrix[11],
  ];
}

function parse3mf(data: Uint8Array, acc: Accumulator) {
  const files = unzipSync(data, {
    filter: (file) =>
      /(^|\/)3dmodel\.model$/i.test(file.name) &&
      file.originalSize <= MAX_XML_BYTES,
  });
  const xmlBytes = Object.entries(files).find(([name]) =>
    /(^|\/)3dmodel\.model$/i.test(name),
  )?.[1];
  if (!xmlBytes) throw new Error("3MF model is missing or too large");
  const document = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
  }).parse(new TextDecoder().decode(xmlBytes)) as Record<string, unknown>;
  const model = part(document, "model") as Record<string, unknown> | undefined;
  if (!model) throw new Error("Invalid 3MF model");
  const units: Record<string, number> = {
    micron: 0.001,
    millimeter: 1,
    centimeter: 10,
    inch: 25.4,
    foot: 304.8,
    meter: 1000,
  };
  const scale = units[String(model["@unit"] ?? "millimeter")];
  if (!scale) throw new Error("Unsupported 3MF units");
  const resources = part(model, "resources") as
    Record<string, unknown> | undefined;
  const objects = new Map(
    children(resources && part(resources, "object")).map((object) => [
      String(object["@id"]),
      object,
    ]),
  );
  const build = part(model, "build") as Record<string, unknown> | undefined;
  const items = children(build && part(build, "item"));
  if (!items.length) throw new Error("3MF build has no items");

  const emit = (id: string, transforms: unknown[], depth: number) => {
    if (depth > 8) throw new Error("3MF components are too deeply nested");
    const object = objects.get(id);
    if (!object) throw new Error("3MF build references a missing object");
    const mesh = part(object, "mesh") as Record<string, unknown> | undefined;
    if (mesh) {
      const verticesNode = part(mesh, "vertices") as
        Record<string, unknown> | undefined;
      const trianglesNode = part(mesh, "triangles") as
        Record<string, unknown> | undefined;
      const vertices = children(verticesNode && part(verticesNode, "vertex"));
      const triangles = children(
        trianglesNode && part(trianglesNode, "triangle"),
      );
      const point = (index: unknown): Point => {
        const vertex = vertices[Number(index)];
        if (!vertex) throw new Error("Invalid 3MF vertex index");
        let result: Point = [
          numeric(vertex["@x"]),
          numeric(vertex["@y"]),
          numeric(vertex["@z"]),
        ];
        for (const transform of transforms)
          result = transformPoint(result, transform);
        return result.map((value) => value * scale) as Point;
      };
      for (const triangle of triangles)
        acc.add(
          point(triangle["@v1"]),
          point(triangle["@v2"]),
          point(triangle["@v3"]),
        );
    }
    const components = part(object, "components") as
      Record<string, unknown> | undefined;
    for (const component of children(
      components && part(components, "component"),
    ))
      emit(
        String(component["@objectid"]),
        [component["@transform"], ...transforms],
        depth + 1,
      );
  };
  for (const item of items)
    emit(String(item["@objectid"]), [item["@transform"]], 0);
}

export function measureModel(data: Uint8Array, fileName: string): ModelMetrics {
  if (!data.length || data.length > 50 * 1024 * 1024)
    throw new Error("File must be under 50 MB");
  const acc = new Accumulator();
  if (/\.stl$/i.test(fileName)) parseStl(data, acc);
  else if (/\.obj$/i.test(fileName)) parseObj(data, acc);
  else if (/\.3mf$/i.test(fileName)) parse3mf(data, acc);
  else throw new Error("Use an STL, OBJ, or 3MF file");
  return acc.finish();
}
