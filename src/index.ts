import { ReadonlyVec2, mat4, vec2 } from "gl-matrix";
import { Foliage } from "./foliage";
import { DummyProfiler, GPUProfiler, Profiler } from "./profiler";
import { Terrain } from "./terrain";
import {
  assert,
  DrawPass,
  SCENE_DATA_SIZE,
  State,
  rad,
  rgba,
  complexMul,
  TAU,
  PostPass,
} from "./utils";
import { ColorCorrect } from "./color_correct";

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

  const targetFormat = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: targetFormat,
    alphaMode: "premultiplied",
  });

  const targetSize = [canvas.width, canvas.height] as const;
  const depthTex = device.createTexture({
    size: targetSize,
    format: "depth16unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const state: State = {
    enable_profiling,

    device,
    targetSize,
    targetFormat,
    depthTex,

    sceneData: new ArrayBuffer(SCENE_DATA_SIZE),
    sceneDataBuf: device.createBuffer({
      size: SCENE_DATA_SIZE,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    }),

    trilinearSampler: device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    }),

    canvas,
    context,

    camera: {
      proj: mat4.perspective(mat4.create(), rad(90), canvas.width / canvas.height, 0.1, 100),
      look: mat4.create(),
      pos: vec2.clone([6, 7]),
      dir: vec2.clone([1, 0]),
      // look: mat4.lookAt(mat4.create(), [50, 30, 0], [0, 1.0, 0], [0, 1, 0]),
      // look: mat4.lookAt(mat4.create(), [0, 30, 50], [0, 1.0, 0], [0, 1, 0]),
      // look: mat4.lookAt(mat4.create(), [1, 40, 0], [0, 1.0, 0], [0, 1, 0]),
    },
  };

  updateCamera(state);
  canvas.addEventListener("mousedown", (ev) => canvas.requestPointerLock());
  canvas.addEventListener("mouseup", (ev) => {
    if (ev.buttons === 0) {
      document.exitPointerLock();
    }
  });

  canvas.addEventListener("mousemove", (ev) => {
    ev.preventDefault();
    const move = [-ev.movementX, -ev.movementY] as const;
    switch (ev.buttons) {
      case 1:
        moveCamera(state, move);
        break;

      case 2:
        rotateCamera(state, move);
        break;
    }
  });

  return state;
}

function moveCamera(state: State, delta: ReadonlyVec2): void {
  const rotatedDelta = vec2.create();
  vec2.scale(rotatedDelta, delta, 0.01);
  complexMul(rotatedDelta, state.camera.dir, rotatedDelta);
  vec2.add(state.camera.pos, state.camera.pos, [-rotatedDelta[1], rotatedDelta[0]]);
  updateCamera(state);
}

function rotateCamera(state: State, delta: ReadonlyVec2): void {
  const x = delta[0] * (TAU / 360) * 0.2;
  complexMul(state.camera.dir, state.camera.dir, [Math.cos(x), Math.sin(x)]);
  updateCamera(state);
}

function updateCamera(state: State): void {
  const at = vec2.create();
  vec2.scaleAndAdd(at, state.camera.pos, state.camera.dir, 9);

  mat4.lookAt(
    state.camera.look,
    [state.camera.pos[0], 5.5, state.camera.pos[1]],
    [at[0], 1.0, at[1]],
    [0, 1, 0],
  );
}

const SKY_BLUE = rgba("#87CEEB");

const DRAW_PASSES: ((state: State) => Promise<DrawPass>)[] = [
  // Declare render passes
  Terrain.create,
  Foliage.create,
];
const POST_PASSES: ((state: State, inputColorTex: GPUTextureView) => Promise<PostPass>)[] = [
  // Declare postprocessing passes
  // Shade.create,
  ColorCorrect.create,
];

// Init engine
console.time("engine init");
const state = await init({ enable_profiling: false });

const colorTargets = [0, 0].map(() => {
  const tex = state.device.createTexture({
    size: state.targetSize,
    format: state.targetFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const view = tex.createView({});
  return view;
});

const draw_passes: DrawPass[] = await Promise.all(DRAW_PASSES.map((factory) => factory(state)));
const post_passes: PostPass[] = await Promise.all(
  POST_PASSES.map((factory, i) => factory(state, colorTargets[i & 1])),
);
if (post_passes.length < 1) {
  // TODO: handle this case properly in `draw`
  throw "At least one postprocessing pass is required";
}

console.timeEnd("engine init");

console.time("gpu init");
await state.device.queue.onSubmittedWorkDone();
console.timeEnd("gpu init");

const profiler: Profiler = state.enable_profiling
  ? new GPUProfiler(state.device, draw_passes.length + post_passes.length)
  : new DummyProfiler();
const profileSectionName = (idx: number) => {
  let i = idx;
  if (i === 0) {
    return "Full frame";
  }
  i--;
  if (i < draw_passes.length) {
    return draw_passes[i].constructor.name;
  }
  i -= draw_passes.length;
  if (i < post_passes.length) {
    return post_passes[i].constructor.name;
  }
  i -= post_passes.length;
  throw `Invalid profile section ID: ${idx}`;
};

const startTime = performance.now();
let frameCount = 0;
let prevFrame = startTime;
const allFrames: number[] = [];
const totalProfileSections = new Array(profiler.sectionCount);
const draw = async (dt: DOMHighResTimeStamp) => {
  if (state.enable_profiling && dt - startTime > 5000) {
    if (totalProfileSections.length > 0) {
      let results = "Average profile timings:\n";
      for (const [idx, delta] of totalProfileSections.entries()) {
        results += `- ${profileSectionName(idx)}: ${(delta / frameCount).toFixed(5)}ms\n`;
      }
      console.log(results);
    }
    return;
  }

  if (!state.enable_profiling) {
    currentAnimationFrame = requestAnimationFrame(draw);
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
    const outlier = curDev > stdDev;

    const frameIdx = frameCount - 1;
    if (state.enable_profiling || outlier || frameIdx % 60 === 0) {
      const msg = outlier ? console.warn : console.log;
      msg(`frame ${frameIdx}: ${lastFrame.toFixed(2)}ms (${average.toFixed(2)}ms avg)`);

      const profileSections = await profiler.read();
      if (profileSections.length > 0) {
        let results = "Profile for last frame:\n";
        for (const [idx, section] of profileSections.entries()) {
          const delta = section.end - section.start;
          const deltaMs = Number(delta) / 1_000_000;
          results += `- ${profileSectionName(idx)}: ${deltaMs.toFixed(5)}ms`;
          results += "\n";

          totalProfileSections[idx] = (totalProfileSections[idx] ?? 0) + deltaMs;
        }
        msg(results);
      }
    }
  }
  frameCount++;
  prevFrame = dt;

  {
    // Generate MVP matrix
    const mvp = new Float32Array(state.sceneData, 0, 4 * 4);
    mat4.mul(mvp, state.camera.proj, state.camera.look);
    // Update current time
    const data = new DataView(state.sceneData);
    data.setFloat32(4 * 4 * 4, (dt - startTime) / 1000, true);
    // Upload scene data
    state.device.queue.writeBuffer(state.sceneDataBuf, 0, state.sceneData);
  }

  state.device.pushErrorScope("validation");

  const targetAttach: GPURenderPassColorAttachment = {
    view: colorTargets[0],
    clearValue: SKY_BLUE,
    loadOp: "clear",
    storeOp: "store",
  };
  const depthAttach: GPURenderPassDepthStencilAttachment = {
    view: state.depthTex.createView({}),
    depthClearValue: 1,
    depthLoadOp: "clear",
    depthStoreOp: "store",
  };

  const encoder = state.device.createCommandEncoder({});
  const prof = profiler.beginFrame(encoder);

  for (const pass of draw_passes) {
    const rp = encoder.beginRenderPass({
      colorAttachments: [targetAttach],
      depthStencilAttachment: pass.writes_depth_buffer ? depthAttach : undefined,
      timestampWrites: prof.pass(),
    });
    pass.draw(state, rp);
    rp.end();

    targetAttach.loadOp = "load";
    depthAttach.depthLoadOp = "load";
  }

  for (const [idx, pass] of post_passes.entries()) {
    if (idx === post_passes.length - 1) {
      // Last pass, draw to the screen
      const screen = state.context.getCurrentTexture();
      targetAttach.view = screen.createView({});
    } else {
      targetAttach.view = colorTargets[1 - (idx & 1)];
    }

    const rp = encoder.beginRenderPass({
      colorAttachments: [targetAttach],
      timestampWrites: prof.pass(),
    });
    pass.draw(state, rp);
    rp.end();

    targetAttach.loadOp = "load";
    depthAttach.depthLoadOp = "load";
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

  const err = await state.device.popErrorScope();
  if (err !== null) {
    cancelAnimationFrame(currentAnimationFrame);
    throw new Error(`validation error:\n${err.message}`);
  }

  if (state.enable_profiling) {
    currentAnimationFrame = requestAnimationFrame(draw);
  }
};
let currentAnimationFrame = requestAnimationFrame(draw);

window.stop = () => cancelAnimationFrame(currentAnimationFrame);
