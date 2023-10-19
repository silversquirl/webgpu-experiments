import { ReadonlyVec2, mat4, vec2 } from "gl-matrix";

export function alignUp(align: number, x: number): number {
  return -(-x & -align);
}

export const TAU = 2 * Math.PI;

export function rad(deg: number): number {
  return deg * (TAU / 360);
}

export function formatMatrix(mat: mat4): string {
  let s = "";
  for (let y = 0; y < 4; y++) {
    if (y > 0) s += "\n";
    for (let x = 0; x < 4; x++) {
      if (x > 0) s += " ";
      const v = mat[y * 4 + x];
      if (v >= 0) s += " ";
      s += v.toFixed(3);
    }
  }
  return s;
}

export function complexMul(out: vec2, a: ReadonlyVec2, b: ReadonlyVec2): void {
  const r = a[0] * b[0] - a[1] * b[1];
  const c = a[0] * b[1] + a[1] * b[0];
  out[0] = r;
  out[1] = c;
}
