import { mat4 } from "gl-matrix";
import { Foliage } from "./foliage";
import { DummyProfiler, GPUProfiler, Profiler } from "./profiler";
import { Terrain } from "./terrain";
import { assert, Pass, SCENE_DATA_SIZE, State, rad, rgba } from "./utils";

async function init(opts: { enable_profiling?: boolean } = {}): Promise<State> {
  let enable_profiling = opts.enable_profiling ?? false;

  const adapter = await navigator.gpu.requestAdapter();
  assert(adapter !== null, "failed to get adapter");
  if (enable_profiling && !adapter.features.has("timestamp-query")) {
    console.warn("profiling disabled due to lack of support for timestamp queries");
    enable_profiling = false;
  }
  const device = await adapter.requestDevice({
    requiredFeatures: enable_profiling ? ["timestamp-query"] : [],
  });

  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 720;
  document.body.appendChild(canvas);
  const context = canvas.getContext("webgpu");
  assert(context !== null, "failed to get context");

  const preferredFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: preferredFormat,
    alphaMode: "premultiplied",
  });

  return {
    enable_profiling,

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

type PassFactory = (state: State) => Promise<Pass>;
const PASSES: PassFactory[] = [
  // Declare render passes
  Terrain.create,
  Foliage.create,
];

// Init engine
console.time("engine init");
const state = await init({ enable_profiling: true });
const passes: Pass[] = await Promise.all(PASSES.map((factory) => factory(state)));
console.timeEnd("engine init");
console.time("gpu init");
await state.device.queue.onSubmittedWorkDone();
console.timeEnd("gpu init");

const profiler: Profiler = state.enable_profiling
  ? new GPUProfiler(state.device, passes.length)
  : new DummyProfiler();

const startTime = performance.now();
let frameCount = 0;
let prevFrame = startTime;
const allFrames: number[] = [];
const totalProfileSections = new Array(profiler.sectionCount);
const draw = async (dt: DOMHighResTimeStamp) => {
  if (dt - startTime > 2000) {
    if (totalProfileSections.length > 0) {
      let results = "Average profile timings:\n";
      for (const delta of totalProfileSections) {
        results += `- ${(delta / frameCount).toFixed(5)}ms\n`;
      }
      console.log(results);
    }
    return;
  }

  if (!state.enable_profiling) {
    requestAnimationFrame(draw);
  }

  if (frameCount > 0) {
    const lastFrame = dt - prevFrame;
    allFrames.push(lastFrame);

    const average = allFrames.reduce((x, y) => x + y) / allFrames.length;
    const stdDev = Math.sqrt(
      allFrames
        .map((v) => average - v)
        .map((v) => v * v)
        .reduce((x, y) => x + y),
    );

    const curDev = Math.abs(average - lastFrame);
    const msg = curDev > stdDev ? console.warn : console.log;

    msg(`${lastFrame.toFixed(3)}ms (${average.toFixed()}ms avg)`);

    const profileSections = await profiler.read();
    if (profileSections.length > 0) {
      let results = "Profile for last frame:\n";
      const deltas = [];
      for (const [idx, section] of profileSections.entries()) {
        const delta = section.end - section.start;
        const deltaMs = Number(delta) / 1_000_000;
        results += `- ${deltaMs.toFixed(5)}ms`;
        // results += ` (start: ${section.start}; end: ${section.end})`;
        results += "\n";

        totalProfileSections[idx] = (totalProfileSections[idx] ?? 0) + deltaMs;
      }
      msg(results);
    }
  }
  frameCount++;
  prevFrame = dt;

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
  const prof = profiler.beginFrame(encoder);

  for (const pass of passes) {
    const rp = encoder.beginRenderPass({
      colorAttachments: [attach],
      timestampWrites: prof.pass(),
    });
    pass.draw(state, rp);
    rp.end();

    attach.loadOp = "load";
  }

  prof.finish();
  const buf = encoder.finish();
  state.device.queue.submit([buf]);

  if (state.enable_profiling) {
    console.time("frame draw");
  }
  await state.device.queue.onSubmittedWorkDone();
  if (state.enable_profiling) {
    console.timeEnd("frame draw");
  }

  if (state.enable_profiling) {
    requestAnimationFrame(draw);
  }
};
draw(startTime);
