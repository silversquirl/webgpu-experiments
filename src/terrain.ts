// @ts-expect-error
import SHADER_SOURCE from "./terrain.wgsl";
import { Pass, State } from "./utils";

export class Terrain implements Pass {
  constructor(readonly pipeline: GPURenderPipeline, readonly binds: GPUBindGroup) {}
  static async create(state: State): Promise<Terrain> {
    const shader = await state.device.createShaderModule({
      code: SHADER_SOURCE,
      // TODO: provide hints
    });

    const pipeline = await state.device.createRenderPipelineAsync({
      layout: "auto",
      vertex: {
        module: shader,
        entryPoint: "vertex",
      },
      primitive: { topology: "triangle-strip" },
      fragment: {
        module: shader,
        entryPoint: "fragment",
        targets: [{ format: state.preferredFormat }],
      },
      // depthStencil: {},
    });

    const binds = state.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: state.sceneDataBuf },
        },
      ],
    });

    return new Terrain(pipeline, binds);
  }

  draw(state: State, pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.binds);
    pass.draw(4);
  }
}
