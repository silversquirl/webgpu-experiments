import { mat4 } from "gl-matrix";
import { Terrain } from "./terrain";
import { Pass, State } from "./types";

const TAU = 2 * Math.PI;
function rad(deg: number): number {
  return deg * (TAU / 360);
}

type Color = readonly [number, number, number, number];
function rgba(color: string): Color {
  const m = color.match(/^#([0-9a-z]{2})([0-9a-z]{2})([0-9a-z]{2})([0-9a-z]{2})?$/i);
  if (m === null) {
    throw new Error(`invalid hex color string '${color}'`);
  }
  const [r, g, b, a] = m.slice(1).map((hex) => parseInt(hex ?? "ff", 16) / 255);
  return [r, g, b, a];
}

function assert(cond: boolean, message = ""): asserts cond {
  if (!cond) {
    if (message !== "") {
      throw new Error("assertion failed");
    } else {
      throw new Error(`assertion failed: ${message}`);
    }
  }
}

async function init(): Promise<State> {
  const adapter = await navigator.gpu.requestAdapter();
  assert(adapter !== null);
  const device = await adapter.requestDevice();

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 720;
  document.body.appendChild(canvas);
  const context = canvas.getContext("webgpu");
  assert(context !== null);

  const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: preferredFormat,
    alphaMode: "premultiplied",
  });

  return {
    device,
    preferredFormat,

    canvas,
    context,

    camera: {
      proj: mat4.perspective(mat4.create(), rad(90), canvas.width / canvas.height, 0.1, 100),
      look: mat4.lookAt(mat4.create(), [0, 2, -5], [0, 0, 0], [0, 1, 0]),
    },
  };
}

const SKY_BLUE = rgba("#87CEEB");

// Declare render passes
type PassFactory = (state: State) => Promise<Pass>;
const PASSES: PassFactory[] = [Terrain.create];

// Init engine
const state = await init();
const passes: Pass[] = await Promise.all(PASSES.map((factory) => factory(state)));
const draw = () => {
  const tex = state.context.getCurrentTexture();
  const attach: GPURenderPassColorAttachment = {
    view: tex.createView({}),
    clearValue: SKY_BLUE,
    loadOp: "clear",
    storeOp: "store",
  };

  const encoder = state.device.createCommandEncoder({});
  for (const pass of passes) {
    const rp = encoder.beginRenderPass({
      colorAttachments: [attach],
    });
    pass.draw(state, rp);
    rp.end();

    attach.loadOp = "load";
  }

  const buf = encoder.finish();
  state.device.queue.submit([buf]);

  // requestAnimationFrame(draw);
};
draw();
