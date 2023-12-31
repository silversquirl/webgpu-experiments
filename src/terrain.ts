import SHADER_SOURCE from "./terrain.wgsl";
import { DrawPass, State, texture } from "./utils";

// Grid will be 2^SIZE - 1 on each side
const SIZE = 6;
const N_COLS_ROWS = (1 << SIZE) - 1;
const SCALE = 80 / N_COLS_ROWS;

const N_VERTS =
  2 * N_COLS_ROWS * N_COLS_ROWS + // 2 verts per tri
  2 * N_COLS_ROWS; // 2 extras per row

const CONSTANTS = {
  width: N_COLS_ROWS,
  height_log2: SIZE,
  scale: SCALE,
};

export class Terrain implements DrawPass {
  writes_depth_buffer = true;

  constructor(readonly pipeline: GPURenderPipeline, readonly binds: GPUBindGroup) {}
  static async create(state: State, outputFormat: GPUTextureFormat): Promise<Terrain> {
    // Start loading textures immediately
    const heightmapTex = texture(
      state,
      GPUTextureUsage.TEXTURE_BINDING,
      "/assets/terrain_heightmap.png",
    );

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

    return new Terrain(pipeline, binds);
  }

  draw(state: State, pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.binds);
    pass.draw(N_VERTS);
  }
}
