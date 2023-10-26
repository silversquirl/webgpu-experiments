import { mat4 } from "gl-matrix";
import SHADER_SOURCE from "./fog.wgsl";
import { PostPass, State, createFullscreenPipeline } from "./utils";

export class Fog implements PostPass {
  inverseProjectionData = new Float32Array(4 * 4);
  constructor(
    readonly pipeline: GPURenderPipeline,
    readonly binds: GPUBindGroup,
    readonly inverseProjectionBuf: GPUBuffer,
  ) {}

  static async create(
    state: State,
    inputTex: GPUTextureView,
    outputFormat: GPUTextureFormat,
  ): Promise<Fog> {
    const layout = state.device.createPipelineLayout({
      bindGroupLayouts: [
        state.device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
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

    const inverseProjectionBuf = state.device.createBuffer({
      size: 4 * 4 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const binds = state.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inverseProjectionBuf } },
        { binding: 1, resource: inputTex },
        { binding: 2, resource: state.depthTex.createView() },
      ],
    });

    return new Fog(pipeline, binds, inverseProjectionBuf);
  }

  draw(state: State, pass: GPURenderPassEncoder): void {
    mat4.invert(this.inverseProjectionData, state.camera.proj);
    state.device.queue.writeBuffer(this.inverseProjectionBuf, 0, this.inverseProjectionData);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.binds);
    pass.draw(3);
  }
}
