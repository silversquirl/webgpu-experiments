export interface Profiler {
  beginFrame(encoder: GPUCommandEncoder): FrameProfiler;
  read(): Promise<ProfileSection[]>;
  sectionCount: number;
}
export interface FrameProfiler {
  finish(): void;
  pass(): GPURenderPassTimestampWrites | undefined;
}

export type ProfileSection = {
  start: bigint;
  end: bigint;
};

export class GPUProfiler implements Profiler {
  readonly _querySet: GPUQuerySet;
  readonly _queryBuf: GPUBuffer;
  readonly _downloadBuf: GPUBuffer;
  readonly sectionCount: number;
  private pendingMap: Promise<void> | undefined;

  constructor(device: GPUDevice, extraSectionCount: number) {
    this.sectionCount = 1 + extraSectionCount;
    this._querySet = device.createQuerySet({
      type: "timestamp",
      count: this.queryCount,
    });
    this._queryBuf = device.createBuffer({
      size: this._bufferSize,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.QUERY_RESOLVE,
    });
    this._downloadBuf = device.createBuffer({
      size: this._bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  beginFrame(encoder: GPUCommandEncoder): GPUFrameProfiler {
    return new GPUFrameProfiler(this, encoder);
  }

  async read(): Promise<ProfileSection[]> {
    await this._downloadBuf.mapAsync(GPUMapMode.READ);
    const array = new BigUint64Array(this._downloadBuf.getMappedRange());
    const sections = [];
    for (let i = 0; i < array.length; i += 2) {
      sections.push({
        start: array[i],
        end: array[i + 1],
      });
    }
    this._downloadBuf.unmap();

    return sections;
  }

  get queryCount(): number {
    return 2 * this.sectionCount;
  }
  get _bufferSize(): number {
    return 8 * this.queryCount;
  }
}
class GPUFrameProfiler implements FrameProfiler {
  idx = 2; // 0 and 1 reserved for full frame timings

  constructor(private readonly profiler: GPUProfiler, private readonly encoder: GPUCommandEncoder) {
    this.encoder.writeTimestamp(this.profiler._querySet, 0);
  }

  finish(): void {
    const prof = this.profiler;
    this.encoder.writeTimestamp(prof._querySet, 1);
    this.encoder.resolveQuerySet(prof._querySet, 0, prof.queryCount, prof._queryBuf, 0);
    this.encoder.copyBufferToBuffer(prof._queryBuf, 0, prof._downloadBuf, 0, prof._bufferSize);
  }

  pass(): GPURenderPassTimestampWrites {
    return {
      querySet: this.profiler._querySet,
      beginningOfPassWriteIndex: this.idx++,
      endOfPassWriteIndex: this.idx++,
    };
  }
}

export class DummyProfiler implements Profiler {
  readonly sectionCount = 0;
  beginFrame(): FrameProfiler {
    return new DummyFrameProfiler();
  }
  async read(): Promise<ProfileSection[]> {
    return [];
  }
}
class DummyFrameProfiler implements FrameProfiler {
  finish(): void {}
  pass(): GPURenderPassTimestampWrites | undefined {
    return undefined;
  }
}
