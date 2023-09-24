import { mat4 } from "gl-matrix";
import { Terrain } from "./terrain";
import { Pass, SCENE_DATA_SIZE, State, assert, rad, rgba } from "./utils";

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

    sceneData: new ArrayBuffer(SCENE_DATA_SIZE),
    sceneDataBuf: device.createBuffer({
      size: SCENE_DATA_SIZE,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    }),

    canvas,
    context,

    camera: {
      proj: mat4.perspective(mat4.create(), rad(90), canvas.width / canvas.height, 0.1, 100),
      look: mat4.lookAt(mat4.create(), [4, 3.5, 5], [0, 1.0, 0], [0, 1, 0]),
    },
  };
}

const SKY_BLUE = rgba("#87CEEB");

// Declare render passes
type PassFactory = (state: State) => Promise<Pass>;
const PASSES: PassFactory[] = [Terrain.create];

// Init engine
console.time("engine init");
const state = await init();
const passes: Pass[] = await Promise.all(PASSES.map((factory) => factory(state)));
console.timeEnd("engine init");
console.time("gpu init");
await state.device.queue.onSubmittedWorkDone();
console.timeEnd("gpu init");

const startTime = performance.now();
let frameCount = 0;
let prevFrame = startTime;
const draw = async (dt: DOMHighResTimeStamp) => {
  if (dt - startTime > 2000) {
    return;
  }

  requestAnimationFrame(draw);

  console.log(`${dt - prevFrame}ms`);
  console.log(`${(dt - startTime) / frameCount}ms avg`);

  frameCount++;
  prevFrame = dt;

  console.time("frame build");

  {
    // Generate MVP matrix
    const mvp = new Float32Array(state.sceneData, 0, 4 * 4);
    mat4.mul(mvp, state.camera.proj, state.camera.look);
    // Upload scene data
    state.device.queue.writeBuffer(state.sceneDataBuf, 0, state.sceneData);
  }

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

  console.timeEnd("frame build");

  await state.device.queue.onSubmittedWorkDone();
};
draw(startTime);
