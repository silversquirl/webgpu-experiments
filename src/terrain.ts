// @ts-expect-error
import SHADER_SOURCE from "./terrain.wgsl";
import { Pass, State } from "./types";

export class Terrain implements Pass {
  constructor(readonly pipeline: GPURenderPipeline) {}
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
    return new Terrain(pipeline);
  }

  draw(state: State, pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.draw(4);
  }
}
