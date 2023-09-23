import { mat4 } from "gl-matrix";

export interface State {
  device: GPUDevice;
  preferredFormat: GPUTextureFormat;

  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;

  camera: { proj: mat4; look: mat4 };
}

export interface Pass {
  draw(state: State, pass: GPURenderPassEncoder): void;
}
