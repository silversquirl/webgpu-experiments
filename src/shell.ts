// Shell rendering
import SHADER_SOURCE from "./shell.wgsl";
import { DrawPass, State } from "./utils";

const SHELL_COUNT = 256;
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
          entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} },
            {
              binding: 1,
              visibility: GPUShaderStage.FRAGMENT,
              texture: { sampleType: "unfilterable-float", viewDimension: "2d-array" },
            },
          ],
        }),
      ],
    });

    const computeLayout = state.device.createPipelineLayout({
      bindGroupLayouts: [
        state.device.createBindGroupLayout({
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.COMPUTE,
              storageTexture: { format: "r32float", viewDimension: "2d-array" },
            },
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

    const [pipeline, computePipeline] = await Promise.all([
      state.device.createRenderPipelineAsync({
        layout,

        vertex: {
          module: shader,
          entryPoint: "vertex",
          constants: {
            shell_count: SHELL_COUNT,
            total_height: HEIGHT,
            plane_size: PLANE_SIZE,
          },
        },
        primitive: { topology: "triangle-strip" },
        fragment: {
          module: shader,
          entryPoint: "fragment",
          constants: {
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
      }),

      state.device.createComputePipelineAsync({
        layout: computeLayout,
        compute: {
          module: shader,
          entryPoint: "genNoiseTexture",
          constants: {
            shell_count: SHELL_COUNT,
          },
        },
      }),
    ]);

    const noiseTexture = state.device.createTexture({
      size: [BLADE_COUNT_ACROSS, BLADE_COUNT_ACROSS, SHELL_COUNT],
      format: "r32float",
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Generate noise texture using compute shader
    {
      const binds = state.device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: noiseTexture.createView() }],
      });

      const encoder = state.device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setPipeline(computePipeline);
      pass.setBindGroup(0, binds);
      pass.dispatchWorkgroups(BLADE_COUNT_ACROSS, BLADE_COUNT_ACROSS, SHELL_COUNT);

      pass.end();
      const cmds = encoder.finish();
      state.device.queue.submit([cmds]);
    }

    const binds = state.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: state.sceneDataBuf } },
        { binding: 1, resource: noiseTexture.createView() },
      ],
    });

    return new Shell(pipeline, binds);
  }

  draw(state: State, pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.binds);
    pass.draw(4, SHELL_COUNT);
  }
}
