import { buildAliasTables, sampleAliasTables } from "./alias";
import SHADER_SOURCE from "./foliage.wgsl";
import { Model, Pass, SCENE_DATA_SIZE, State, TAU, imageData, model, texture } from "./utils";

const INSTANCE_COUNT = 100_000;
const GRASS_AREA = 80;

const CONSTANTS = {
  scale: 2.0 / GRASS_AREA,
};

export class Foliage implements Pass {
  constructor(
    readonly pipeline: GPURenderPipeline,
    readonly binds: GPUBindGroup,
    readonly bladeModel: Model,
    readonly instanceBuf: GPUBuffer,
  ) {}

  static async create(state: State): Promise<Foliage> {
    // Start loading assets immediately
    const bladeModel = model(state, GPUBufferUsage.VERTEX, "/assets/grass_blade.high.stl");
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
            {
              binding: 0,
              visibility: GPUShaderStage.VERTEX,
              buffer: { minBindingSize: SCENE_DATA_SIZE },
            },
            { binding: 1, visibility: GPUShaderStage.VERTEX, sampler: {} },
            { binding: 2, visibility: GPUShaderStage.VERTEX, texture: {} },
          ],
        }),
      ],
    });

    const shader = await state.device.createShaderModule({
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
            arrayStride: 3 * 4,
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
            ],
          },
        ],
      },
      primitive: { topology: "triangle-strip" },
      fragment: {
        module: shader,
        entryPoint: "fragment",
        targets: [{ format: state.targetFormat }],
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

    // Build random distribution tables
    const heatmapData = await heatmap;
    console.time("build alias");
    const prob = new Float32Array(heatmapData.width * heatmapData.height);
    const alias = new Uint32Array(heatmapData.width * heatmapData.height);
    const max = buildAliasTables(prob, alias, heatmapData);
    console.timeEnd("build alias");
    // Generate random instance buffer
    const instanceBuf = state.device.createBuffer({
      size: INSTANCE_COUNT * 3 * 4,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    const instanceData = new Float32Array(instanceBuf.getMappedRange());
    const factorX = GRASS_AREA / heatmapData.width;
    const factorY = GRASS_AREA / heatmapData.height;
    const offset = GRASS_AREA / 2;
    for (let instance = 0; instance < INSTANCE_COUNT; instance++) {
      const idx = sampleAliasTables(prob, alias, Math.random());
      const x = idx % heatmapData.width;
      const y = Math.floor(idx / heatmapData.width);
      instanceData[instance * 3 + 0] = x * factorX - offset;
      instanceData[instance * 3 + 1] = y * factorY - offset;

      const angle = Math.random() * TAU;
      instanceData[instance * 3 + 2] = angle;
    }
    instanceBuf.unmap();

    return new Foliage(pipeline, binds, await bladeModel, instanceBuf);
  }

  draw(state: State, pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.binds);
    pass.setVertexBuffer(0, this.bladeModel.buf);
    pass.setVertexBuffer(1, this.instanceBuf);
    pass.draw(this.bladeModel.numVerts, INSTANCE_COUNT);
  }
}
