// Cusp table generator for gamut clipping
/*
 * Most of this code is adapted from https://bottosson.github.io/posts/gamutclipping/
 * Copyright (c) 2021 Björn Ottosson and silversquirl
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { TAU } from "./math";

export function generateCuspLut(lut: Float32Array): void {
  const entries = lut.length / 2;
  const indexQ = 1 / (entries - 1);
  for (let i = 0; i < entries; i++) {
    const h = (i * indexQ - 0.5) * TAU;
    const [L, C] = findCusp(Math.cos(h), Math.sin(h));

    lut[i * 2] = L;
    lut[i * 2 + 1] = C;
  }
}

type Triple = readonly [number, number, number];

// Finds the maximum saturation possible for a given hue that fits in sRGB
// Saturation here is defined as S = C/L
// a and b must be normalized so a^2 + b^2 == 1
function computeMaxSaturation(a: number, b: number): number {
  // Max saturation will be when one of r, g or b goes below zero.

  // Select different coefficients depending on which component goes below zero first
  let k0;
  let k1;
  let k2;
  let k3;
  let k4;
  let wl;
  let wm;
  let ws;

  if (-1.88170328 * a - 0.80936493 * b > 1) {
    // Red component
    k0 = +1.19086277;
    k1 = +1.76576728;
    k2 = +0.59662641;
    k3 = +0.75515197;
    k4 = +0.56771245;
    wl = +4.0767416621;
    wm = -3.3077115913;
    ws = +0.2309699292;
  } else if (1.81444104 * a - 1.19445276 * b > 1) {
    // Green component
    k0 = +0.73956515;
    k1 = -0.45954404;
    k2 = +0.08285427;
    k3 = +0.1254107;
    k4 = +0.14503204;
    wl = -1.2684380046;
    wm = +2.6097574011;
    ws = -0.3413193965;
  } else {
    // Blue component
    k0 = +1.35733652;
    k1 = -0.00915799;
    k2 = -1.1513021;
    k3 = -0.50559606;
    k4 = +0.00692167;
    wl = -0.0041960863;
    wm = -0.7034186147;
    ws = +1.707614701;
  }

  // Approximate max saturation using a polynomial:
  let S = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;

  // Do one step Halley's method to get closer
  // this gives an error less than 10e6, except for some blue hues where the dS/dh is close to infinite
  // this should be sufficient for most applications, otherwise do two/three steps

  const k_l = +0.3963377774 * a + 0.2158037573 * b;
  const k_m = -0.1055613458 * a - 0.0638541728 * b;
  const k_s = -0.0894841775 * a - 1.291485548 * b;

  {
    const l_ = 1 + S * k_l;
    const m_ = 1 + S * k_m;
    const s_ = 1 + S * k_s;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    const l_dS = 3 * k_l * l_ * l_;
    const m_dS = 3 * k_m * m_ * m_;
    const s_dS = 3 * k_s * s_ * s_;

    const l_dS2 = 6 * k_l * k_l * l_;
    const m_dS2 = 6 * k_m * k_m * m_;
    const s_dS2 = 6 * k_s * k_s * s_;

    const f = wl * l + wm * m + ws * s;
    const f1 = wl * l_dS + wm * m_dS + ws * s_dS;
    const f2 = wl * l_dS2 + wm * m_dS2 + ws * s_dS2;

    S = S - (f * f1) / (f1 * f1 - 0.5 * f * f2);
  }

  return S;
}

// finds L_cusp and C_cusp for a given hue
// a and b must be normalized so a^2 + b^2 == 1
function findCusp(a: number, b: number): [L: number, C: number] {
  // First, find the maximum saturation (saturation S = C/L)
  const S_cusp = computeMaxSaturation(a, b);

  // Convert to linear sRGB to find the first point where at least one of r,g or b >= 1:
  const rgb_at_max = oklabToLinearSrgb([1, S_cusp * a, S_cusp * b]);
  const L_cusp = Math.cbrt(1 / Math.max(...rgb_at_max));
  const C_cusp = L_cusp * S_cusp;

  return [L_cusp, C_cusp];
}

function oklabToLinearSrgb(lab: Triple): Triple {
  const l_ = lab[0] + 0.3963377774 * lab[1] + 0.2158037573 * lab[2];
  const m_ = lab[0] - 0.1055613458 * lab[1] - 0.0638541728 * lab[2];
  const s_ = lab[0] - 0.0894841775 * lab[1] - 1.291485548 * lab[2];

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
