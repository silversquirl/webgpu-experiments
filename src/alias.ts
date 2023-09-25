// Implementation of the alias method for efficient discrete probability sampling

/**
 * @param outProb - a Float32Array of length heatmap.width * heatmap.height
 * @param outAlias - a Uint32Array of length heatmap.width * heatmap.height
 * @param heatmap - an image heatmap with probabilities in the red channel
 * @returns the maximum value from the heatmap
 */
export function buildAliasTables(
  outProb: Float32Array,
  outAlias: Uint32Array,
  heatmap: ImageData,
): number {
  const count = heatmap.width * heatmap.height;

  let total = 0;
  let max = 0;
  for (let i = 0; i < count; i++) {
    const value = heatmap.data[i * 4];
    outProb[i] = value;
    total += value;
    max = Math.max(max, value);
  }

  const factor = outProb.length / total;
  const overfull: number[] = [];
  const underfull: number[] = [];
  for (let i = 0; i < count; i++) {
    outProb[i] *= factor;
    if (outProb[i] < 1) {
      underfull.push(i);
    } else if (outProb[i] > 1) {
      overfull.push(i);
    }
  }

  while (true) {
    const o = overfull.pop();
    const u = underfull.pop();

    if (o === undefined || u === undefined) {
      if (o !== undefined) {
        outProb[o] = 1;
      } else if (u !== undefined) {
        outProb[u] = 1;
      } else {
        break;
      }
    } else {
      outAlias[u] = o;
      outProb[o] += outProb[u] - 1;

      if (outProb[o] < 1) {
        underfull.push(o);
      } else if (outProb[o] > 1) {
        overfull.push(o);
      }
    }
  }

  return max;
}

export function sampleAliasTables(
  prob: Float32Array,
  alias: Uint32Array,
  uniformNormalized: number,
): number {
  const p = prob.length * uniformNormalized;
  const i = Math.floor(p);
  const y = p - i;
  return y < prob[i] ? i : alias[i];
}
