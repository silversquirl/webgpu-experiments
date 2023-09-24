// @ts-expect-error
import SHADER_SOURCE from "./terrain.wgsl";
import { Pass, SCENE_DATA_SIZE, State, texture } from "./utils";

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

export class Terrain implements Pass {
  constructor(readonly pipeline: GPURenderPipeline, readonly binds: GPUBindGroup) {}
  static async create(state: State): Promise<Terrain> {
    // Start loading textures immediately
    const heightmapTex = texture(state, GPUTextureUsage.TEXTURE_BINDING, "/assets/terrain_heightmap.png");
    const surfaceTex = texture(state, GPUTextureUsage.TEXTURE_BINDING, "/assets/terrain_surface.png");

    const layout = state.device.createPipelineLayout({
      bindGroupLayouts: [
        state.device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { minBindingSize: SCENE_DATA_SIZE } },
            { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 2, visibility: GPUShaderStage.VERTEX, texture: {} },
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} },
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
        targets: [{ format: state.preferredFormat }],
      },
      // depthStencil: {},
    });

    const trilinearSampler = state.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
    });

    const binds = state.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: state.sceneDataBuf } },
        { binding: 1, resource: trilinearSampler },
        { binding: 2, resource: (await heightmapTex).createView({}) },
        { binding: 3, resource: (await surfaceTex).createView({}) },
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
