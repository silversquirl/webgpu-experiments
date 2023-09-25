import { mat4 } from "gl-matrix";

export interface State {
  enable_profiling: boolean;

  device: GPUDevice;
  targetFormat: GPUTextureFormat;
  depthTex: GPUTexture;

  sceneData: ArrayBuffer;
  sceneDataBuf: GPUBuffer;

  trilinearSampler: GPUSampler;

  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;

  camera: { proj: mat4; look: mat4 };
}
export const SCENE_DATA_SIZE = alignUp(
  16,
  4 * 4 * 4 + // mvp: mat4x4<f32>
    4, // time: f32
);

function alignUp(align: number, x: number): number {
  return -(-x & -align);
}

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

const imageContentCache: Map<string, Promise<ImageBitmap>> = new Map();
const imageTextureCache: Map<string, GPUTexture> = new Map();

// Returns a texture that will be filled with the loaded image data after the next queue flush
export async function texture(
  state: State,
  usage: GPUTextureUsageFlags,
  url: string,
): Promise<GPUTexture> {
  if (
    (usage & GPUTextureUsage.COPY_DST) !== 0 ||
    (usage & GPUTextureUsage.RENDER_ATTACHMENT) !== 0
  ) {
    throw new Error("Loaded texture cannot be writeable");
  }

  let pendingImg = imageContentCache.get(url);
  if (pendingImg === undefined) {
    // Not cached; load it
    pendingImg = fetch(url)
      .then((res) => {
        if (res.status !== 200) {
          throw new Error(`failed to load texture at '${url}': ${res.statusText}`);
        }
        return res.blob();
      })
      .then(createImageBitmap);
    imageContentCache.set(url, pendingImg);
  }
  const img = await pendingImg;

  const texKey = `${usage}:${url}`;
  let tex = imageTextureCache.get(texKey);
  if (tex === undefined) {
    tex = state.device.createTexture({
      size: [img.width, img.height],
      format: state.targetFormat,
      // TODO: check if it's more efficient to upload to a separate RENDER_ATTACHMENT texture and then copy across
      // FIXME: having these flags here also makes the texture mutable, which is bad because we cache it
      usage: usage | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    imageTextureCache.set(texKey, tex);
  }

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

export async function imageData(url: string): Promise<ImageData> {
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("failed to create canvas context");
  }
  ctx.drawImage(img, 0, 0);

  return ctx.getImageData(0, 0, img.width, img.height);
}

// Super primitive binary STL loader
// TODO: caching
export async function model(state: State, usage: GPUBufferUsageFlags, url: string): Promise<Model> {
  const res = await fetch(url);
  if (res.status !== 200) {
    throw new Error(`failed to load model at '${url}': ${res.statusText}`);
  }

  const data = await res.arrayBuffer();
  const view = new DataView(data, 80);
  const numTris = view.getUint32(0, true);
  const numVerts = numTris * 3;

  const buf = state.device.createBuffer({
    size: numVerts * 3 * 4,
    usage,
    mappedAtCreation: true,
  });
  const verts = new Float32Array(buf.getMappedRange());
  for (let tri = 0; tri < numTris; tri++) {
    for (let i = 0; i < 3 * 3; i++) {
      const offset =
        4 + // header
        tri * 50 + // 50 bytes per tri
        12 + // skip normal
        i * 4; // 4 bytes per float
      verts[tri * 3 * 3 + i] = view.getFloat32(offset, true);
    }
  }
  buf.unmap();

  return { buf, numVerts };
}
export type Model = { buf: GPUBuffer; numVerts: number };

export function assert(cond: boolean, message = ""): asserts cond {
  if (!cond) {
    if (message !== "") {
      throw new Error(`assertion failed: ${message}`);
    } else {
      throw new Error("assertion failed");
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
