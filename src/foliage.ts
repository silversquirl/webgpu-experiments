import { vec2 } from "gl-matrix";
import { buildAliasTables, sampleAliasTables } from "./alias";
import SHADER_SOURCE from "./foliage.wgsl";
import {
  Model,
  DrawPass,
  State,
  TAU,
  imageData,
  model,
  texture,
  assert,
  ProfileSegment,
} from "./utils";

const GRASS_AREA = 80;
const CHUNK_SIZE = 10;
const DENSITY = 1250;

const CHUNKS_PER_SIDE = GRASS_AREA / CHUNK_SIZE;
const INSTANCE_COUNT = GRASS_AREA * DENSITY;

const CONSTANTS = {
  scale: 2.0 / GRASS_AREA,
};

export class Foliage implements DrawPass {
  writes_depth_buffer = true;

  constructor(
    readonly pipeline: GPURenderPipeline,
    readonly binds: GPUBindGroup,
    readonly bladeModels: Model[],
    readonly instanceBuffers: InstanceBuffers,
  ) {}

  static async create(state: State, outputFormat: GPUTextureFormat): Promise<Foliage> {
    // Start loading assets immediately
    const bladeModels = ["/assets/grass_blade.high.stl", "/assets/grass_blade.low.stl"].map(
      (path) => model(state, GPUBufferUsage.VERTEX, path),
    );
    const heightmapTex = texture(
      state,
      GPUTextureUsage.TEXTURE_BINDING,
      "/assets/terrain_heightmap.png",
    );
    const heatmap = imageData("/assets/grass_heatmap.png");

    const layout = state.device.createPipelineLayout({
      bindGroupLayouts: [
        state.device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} },
            { binding: 1, visibility: GPUShaderStage.VERTEX, sampler: {} },
            { binding: 2, visibility: GPUShaderStage.VERTEX, texture: {} },
          ],
        }),
      ],
    });

    const shader = state.device.createShaderModule({
      code: SHADER_SOURCE,
      hints: {
        vertex: { layout },
        fragment: { layout },
      },
    });

    const pipeline = await state.device.createRenderPipelineAsync({
      layout,

      vertex: {
        module: shader,
        entryPoint: "vertex",
        constants: CONSTANTS,
        buffers: [
          {
            arrayStride: 3 * 4,
            attributes: [
              {
                format: "float32x3",
                offset: 0,
                shaderLocation: 0,
              },
            ],
          },
          {
            arrayStride: 4 * 4,
            stepMode: "instance",
            attributes: [
              {
                format: "float32x2",
                offset: 0,
                shaderLocation: 1,
              },
              {
                format: "float32",
                offset: 2 * 4,
                shaderLocation: 2,
              },
              {
                format: "float32",
                offset: 3 * 4,
                shaderLocation: 3,
              },
            ],
          },
        ],
      },
      primitive: { topology: "triangle-strip" },
      fragment: {
        module: shader,
        entryPoint: "fragment",
        targets: [{ format: outputFormat }],
      },
      depthStencil: {
        format: state.depthTex.format,
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    const binds = state.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: state.sceneDataBuf } },
        { binding: 1, resource: state.trilinearSampler },
        { binding: 2, resource: (await heightmapTex).createView() },
      ],
    });

    const instanceBuffers = buildInstanceBuffers(state, await heatmap);

    return new Foliage(pipeline, binds, await Promise.all(bladeModels), instanceBuffers);
  }

  draw(state: State, pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.binds);

    for (let y = 0; y < CHUNKS_PER_SIDE; y++) {
      for (let x = 0; x < CHUNKS_PER_SIDE; x++) {
        this.drawChunk(state, pass, x, y);
      }
    }
  }

  drawChunk(state: State, pass: GPURenderPassEncoder, x: number, y: number): void {
    assert(x >= 0 && y >= 0, `negative: x=${x}, y=${y}`);
    assert(x < CHUNKS_PER_SIDE && y < CHUNKS_PER_SIDE, `too big: x=${x}, y=${y}`);

    const idx = x + y * CHUNKS_PER_SIDE;

    const start = this.instanceBuffers.chunks[idx];
    const end = this.instanceBuffers.chunks[idx + 1] ?? INSTANCE_COUNT;
    if (start === end) {
      return;
    }

    const centre_offset = GRASS_AREA / 2 - CHUNK_SIZE / 2;
    const centre_pos = vec2.fromValues(
      x * CHUNK_SIZE - centre_offset,
      y * CHUNK_SIZE - centre_offset,
    );
    const dist_sq = vec2.sqrDist(state.camera.pos, centre_pos);
    const close_dist = 20;
    const close = dist_sq < close_dist * close_dist;

    const model = this.bladeModels[close ? 0 : 1];
    pass.setVertexBuffer(0, model.buf);

    const offset = start * 4 * 4;
    const size = (end - start) * 4 * 4;
    pass.setVertexBuffer(1, this.instanceBuffers.data, offset, size);

    pass.draw(model.numVerts, end - start);
  }
}

function buildInstanceBuffers(state: State, heatmapData: ImageData): InstanceBuffers {
  const profile = new ProfileSegment("generate foliage data");

  // Build random distribution tables
  const buildAliasProfile = new ProfileSegment("build alias table");
  const prob = new Float32Array(heatmapData.width * heatmapData.height);
  const alias = new Uint32Array(heatmapData.width * heatmapData.height);
  const max = buildAliasTables(prob, alias, heatmapData);
  buildAliasProfile.end();

  // Generate random instance buffer
  const fillProfile = new ProfileSegment("fill buffer");
  const data = state.device.createBuffer({
    size: INSTANCE_COUNT * 4 * 4,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  const instanceData = new Float32Array(data.getMappedRange());
  const factorX = GRASS_AREA / heatmapData.width;
  const factorY = GRASS_AREA / heatmapData.height;
  const offset = GRASS_AREA / 2;
  for (let instance = 0; instance < INSTANCE_COUNT; instance++) {
    const idx = sampleAliasTables(prob, alias, Math.random());
    const value = heatmapData.data[idx * 4];
    const x = idx % heatmapData.width;
    const y = Math.floor(idx / heatmapData.width);
    instanceData[instance * 4 + 0] = x * factorX - offset;
    instanceData[instance * 4 + 1] = y * factorY - offset;

    const angle = Math.random() * TAU;
    instanceData[instance * 4 + 2] = angle;

    const height = 0.4 + value * (1 / max);
    instanceData[instance * 4 + 3] = height;
  }
  fillProfile.end();

  const instanceChunkIdx = (idx: number) => {
    const x = Math.floor((instanceData[idx * 4 + 0] + offset) / CHUNK_SIZE);
    const y = Math.floor((instanceData[idx * 4 + 1] + offset) / CHUNK_SIZE);
    assert(x >= 0 && y >= 0, `negative: idx=${idx}, x=${x}, y=${y}`);
    assert(
      x < CHUNKS_PER_SIDE && y < CHUNKS_PER_SIDE,
      `too big: idx=${idx}, x=${x}, y=${y} ${CHUNKS_PER_SIDE}`,
    );
    return x + y * CHUNKS_PER_SIDE;
  };

  // In-place radix sort by chunk index
  const sort = (bit: number, start = 0, end = INSTANCE_COUNT) => {
    const mask = 1 << bit;
    let low = start;
    let high = end;
    while (low < high) {
      const chunkIdx = instanceChunkIdx(low);
      if ((chunkIdx & mask) === 0) {
        low++;
      } else {
        high--;
        for (let i = 0; i < 4; i++) {
          const tmp = instanceData[low * 4 + i];
          instanceData[low * 4 + i] = instanceData[high * 4 + i];
          instanceData[high * 4 + i] = tmp;
        }
      }
    }
    if (bit > 0) {
      if (start < low) {
        sort(bit - 1, start, low);
      }
      if (high < end) {
        sort(bit - 1, high, end);
      }
    }
  };
  const sortProfile = new ProfileSegment("sort buffer");
  sort(Math.ceil(Math.log2(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE)));
  sortProfile.end();

  // Compute chunk offsets
  const chunkProfile = new ProfileSegment("compute chunk offsets");
  const chunks = new Uint32Array(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE);
  let instanceIdx = 0;
  for (let i = 0; i < chunks.length; i++) {
    chunks[i] = instanceIdx;
    while (instanceIdx < INSTANCE_COUNT && instanceChunkIdx(instanceIdx) <= i) {
      instanceIdx++;
    }
  }
  assert(
    instanceIdx === INSTANCE_COUNT,
    `Did not fill chunk buffer correctly: got ${instanceIdx} instances, wanted ${INSTANCE_COUNT}`,
  );
  chunkProfile.end();

  data.unmap();
  profile.end();
  return { data, chunks };
}

type InstanceBuffers = {
  data: GPUBuffer;
  chunks: Uint32Array;
};
