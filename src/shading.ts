import SHADER_SOURCE from "./shading.wgsl";
import { PostPass, State, createFullscreenPipeline, texture } from "./utils";

export class Shade implements PostPass {
  constructor(
    readonly pipeline: GPURenderPipeline,
    readonly inputBinds: GPUBindGroup,
    readonly materialBinds: GPUBindGroup,
  ) {}

  static async create(
    state: State,
    inputTex: GPUTextureView,
    outputFormat: GPUTextureFormat,
  ): Promise<Shade> {
    // Begin loading textures immediately
    const terrainSurfaceTex = texture(
      state,
      GPUTextureUsage.TEXTURE_BINDING,
      "/assets/terrain_surface.png",
    );

    const layout = state.device.createPipelineLayout({
      bindGroupLayouts: [
        state.device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
          ],
        }),
        state.device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
          ],
        }),
      ],
    });

    const shader = state.device.createShaderModule({
      code: SHADER_SOURCE,
    });

    const pipeline = await createFullscreenPipeline(state.device, {
      layout,
      fragment: {
        module: shader,
        entryPoint: "fragment",
        targets: [{ format: outputFormat }],
      },
    });

    const inputBinds = state.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: inputTex },
        { binding: 1, resource: state.depthTex.createView() },
      ],
    });

    const materialBinds = state.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: state.trilinearSampler },
        { binding: 1, resource: (await terrainSurfaceTex).createView() },
      ],
    });

    return new Shade(pipeline, inputBinds, materialBinds);
  }

  draw(state: State, pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.inputBinds);
    pass.setBindGroup(1, this.materialBinds);
    pass.draw(3);
  }
}
