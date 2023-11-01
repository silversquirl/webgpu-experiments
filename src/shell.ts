// Shell rendering
import SHADER_SOURCE from "./shell.wgsl";
import { DrawPass, State } from "./utils";

const HEIGHT = 2.0;
const BLADE_DENSITY = 10;
const PLANE_SIZE = 10;

const BLADE_COUNT_ACROSS = BLADE_DENSITY * PLANE_SIZE;

export class Shell implements DrawPass {
  writes_depth_buffer = true;
  constructor(readonly pipeline: GPURenderPipeline, readonly binds: GPUBindGroup) {}

  static async create(state: State, outputFormat: GPUTextureFormat): Promise<Shell> {
    const layout = state.device.createPipelineLayout({
      bindGroupLayouts: [
        state.device.createBindGroupLayout({
          entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }],
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
        constants: {
          total_height: HEIGHT,
          blade_density: BLADE_DENSITY,
          plane_size: PLANE_SIZE,
        },
      },
      primitive: { topology: "triangle-strip" },
      fragment: {
        module: shader,
        entryPoint: "fragment",
        constants: {
          total_height: HEIGHT,
          blade_density: BLADE_DENSITY,
          plane_size: PLANE_SIZE,
        },
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
      entries: [{ binding: 0, resource: { buffer: state.sceneDataBuf } }],
    });

    return new Shell(pipeline, binds);
  }

  draw(state: State, pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.binds);
    pass.draw(4, 1);
  }
}
