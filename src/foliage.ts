import SHADER_SOURCE from "./foliage.wgsl";
import { Model, Pass, SCENE_DATA_SIZE, State, model } from "./utils";

const INSTANCE_COUNT = 100_000;
const GRASS_AREA = 160;

export class Foliage implements Pass {
  constructor(
    readonly pipeline: GPURenderPipeline,
    readonly binds: GPUBindGroup,
    readonly bladeModel: Model,
    readonly instanceBuf: GPUBuffer,
  ) {}

  static async create(state: State): Promise<Foliage> {
    // Start loading model immediately
    const bladeModel = model(state, GPUBufferUsage.VERTEX, "/assets/grass_blade.stl");

    const layout = state.device.createPipelineLayout({
      bindGroupLayouts: [
        state.device.createBindGroupLayout({
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.VERTEX,
              buffer: { minBindingSize: SCENE_DATA_SIZE },
            },
          ],
        }),
      ],
    });

    const shader = await state.device.createShaderModule({
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
        buffers: [
          {
            arrayStride: 3 * 4,
            attributes: [
              {
                format: "float32x3",
                offset: 0,
                shaderLocation: 0,
              },
            ],
          },
          {
            arrayStride: 2 * 4,
            stepMode: "instance",
            attributes: [
              {
                format: "float32x2",
                offset: 0,
                shaderLocation: 1,
              },
            ],
          },
        ],
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
      entries: [{ binding: 0, resource: { buffer: state.sceneDataBuf } }],
    });

    // Generate random instance buffer
    const instanceBuf = state.device.createBuffer({
      size: INSTANCE_COUNT * 2 * 4,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    const instanceData = new Float32Array(instanceBuf.getMappedRange());
    for (let instance = 0; instance < INSTANCE_COUNT; instance++) {
      for (let i = 0; i < 2; i++) {
        instanceData[instance * 2 + i] = (Math.random() - 0.5) * GRASS_AREA;
      }
    }
    instanceBuf.unmap();

    return new Foliage(pipeline, binds, await bladeModel, instanceBuf);
  }

  draw(state: State, pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.binds);
    pass.setVertexBuffer(0, this.bladeModel.buf);
    pass.setVertexBuffer(1, this.instanceBuf);
    pass.draw(this.bladeModel.numVerts, INSTANCE_COUNT);
  }
}
