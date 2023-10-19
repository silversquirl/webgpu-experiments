import SHADER_SOURCE from "./color_correct.wgsl";
import { generateCuspLut } from "./gamut_clip";
import { PostPass, State, createFullscreenPipeline } from "./utils";

export class ColorCorrect implements PostPass {
  constructor(readonly pipeline: GPURenderPipeline, readonly binds: GPUBindGroup) {}

  static async create(
    state: State,
    inputTex: GPUTextureView,
    outputFormat: GPUTextureFormat,
  ): Promise<ColorCorrect> {
    const layout = state.device.createPipelineLayout({
      bindGroupLayouts: [
        state.device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
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

    const pipeline = await createFullscreenPipeline(state.device, {
      layout,
      fragment: {
        module: shader,
        entryPoint: "fragment",
        targets: [{ format: outputFormat }],
      },
    });

    const srgbCuspLut = state.device.createBuffer({
      size: 256 * 2 * 4,
      usage: GPUBufferUsage.UNIFORM,
      mappedAtCreation: true,
    });
    generateCuspLut(new Float32Array(srgbCuspLut.getMappedRange()));
    srgbCuspLut.unmap();

    const binds = state.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: srgbCuspLut } },
        { binding: 1, resource: inputTex },
      ],
    });

    return new ColorCorrect(pipeline, binds);
  }

  draw(state: State, pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.binds);
    pass.draw(3);
  }
}
