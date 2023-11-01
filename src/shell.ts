// Shell rendering
import SHADER_SOURCE from "./shell.wgsl";
import { DrawPass, State } from "./utils";

const SHELLS = 256;
const CONSTANTS = {
  shells: SHELLS,
};

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
        constants: CONSTANTS,
      },
      primitive: { topology: "triangle-strip" },
      fragment: {
        module: shader,
        entryPoint: "fragment",
        constants: CONSTANTS,
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
    pass.draw(4, SHELLS);
  }
}
