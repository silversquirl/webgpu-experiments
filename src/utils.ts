import { mat4 } from "gl-matrix";

export interface State {
  device: GPUDevice;
  preferredFormat: GPUTextureFormat;

  sceneData: ArrayBuffer;
  sceneDataBuf: GPUBuffer;

  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;

  camera: { proj: mat4; look: mat4 };
}
export const SCENE_DATA_SIZE = 4 * 4 * 4; // mvp: mat4x4<f32>

export interface Pass {
  draw(state: State, pass: GPURenderPassEncoder): void;
}

export const TAU = 2 * Math.PI;

export function rad(deg: number): number {
  return deg * (TAU / 360);
}

export type Color = readonly [number, number, number, number];
export function rgba(color: string): Color {
  const m = color.match(/^#([0-9a-z]{2})([0-9a-z]{2})([0-9a-z]{2})([0-9a-z]{2})?$/i);
  if (m === null) {
    throw new Error(`invalid hex color string '${color}'`);
  }
  const [r, g, b, a] = m.slice(1).map((hex) => parseInt(hex ?? "ff", 16) / 255);
  return [r, g, b, a];
}

// Returns a texture that will be filled with the loaded image data after the next queue flush
export async function texture(state: State, usage: GPUTextureUsageFlags, url: string): Promise<GPUTexture> {
  const res = await fetch(url);
  if (res.status !== 200) {
    throw new Error(`failed to load texture at '${url}': ${res.statusText}`);
  }
  const img = await createImageBitmap(await res.blob());

  const tex = state.device.createTexture({
    size: [img.width, img.height],
    format: state.preferredFormat,
    // TODO: check if it's more efficient to upload to a separate RENDER_ATTACHMENT texture and then copy across
    usage: usage | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  state.device.queue.copyExternalImageToTexture(
    { source: img },
    {
      texture: tex,
      premultipliedAlpha: true,
    },
    [img.width, img.height],
  );

  return tex;
}

export function assert(cond: boolean, message = ""): asserts cond {
  if (!cond) {
    if (message !== "") {
      throw new Error("assertion failed");
    } else {
      throw new Error(`assertion failed: ${message}`);
    }
  }
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
