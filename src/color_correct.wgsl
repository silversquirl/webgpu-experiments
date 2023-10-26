const srgb_cusp_lut_entries = 256u;
const srgb_cusp_lut_array_size = srgb_cusp_lut_entries / 2u;
@group(0) @binding(0) var<uniform> srgb_cusp_lut: array<vec4f, srgb_cusp_lut_array_size>;
@group(0) @binding(1) var input: texture_2d<f32>;

@fragment
fn fragment(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4f {
    let srgb_in = textureLoad(input, vec2<i32>(pixel.xy), 0);
    let rgb_in = srgbToLinear(srgb_in.xyz); // TODO: render in linear RGB
    let alpha = srgb_in.w;

    var lab = linearSrgbToOklab(rgb_in.xyz);
    lab *= vec3(1.1, 1.05, 1.08);

    let clipped = gamutClip(lab);
    return vec4(linearToSrgb(clipped), alpha);
}

const TAU = 6.28318530717958647692528676655900577;

fn srgbToLinear(rgb: vec3<f32>) -> vec3<f32> {
    return pow(rgb + vec3(0.055), vec3(2.4)) / vec3(1.055);
}
fn linearToSrgb(rgb: vec3<f32>) -> vec3<f32> {
    return vec3(1.055) * pow(rgb, vec3(1.0 / 2.4)) - vec3(0.055);
}

fn linearSrgbToOklab(rgb: vec3<f32>) -> vec3<f32> {
    let lms = mat3x3(
        0.4122214708,
        0.2119034982,
        0.0883024619,
        //
        0.5363325363,
        0.6806995451,
        0.2817188376,
        //
        0.0514459929,
        0.1073969566,
        0.6299787005,
    ) * rgb;

    let lms_ = pow(lms, vec3(1.0 / 3.0));

    return mat3x3(
        0.2104542553,
        1.9779984951,
        0.0259040371,
        //
        0.7936177850,
        -2.4285922050,
        0.7827717662,
        //
        -0.0040720468,
        0.4505937099,
        -0.8086757660,
    ) * lms_;
}

fn oklabToLinearSrgb(lab: vec3<f32>) -> vec3<f32> {
    let lms_ = mat3x3(
        1.0,
        1.0,
        1.0,
        //
        0.3963377774,
        -0.1055613458,
        -0.0894841775,
        //
        0.2158037573,
        -0.0638541728,
        -1.2914855480,
    ) * lab;

    let lms = lms_ * lms_ * lms_;

    return mat3x3(
        4.0767416621,
        -1.2684380046,
        -0.0041960863,
        //
        -3.3077115913,
        2.6097574011,
        -0.7034186147,
        //
        0.2309699292,
        -0.3413193965,
        1.7076147010,
    ) * lms;
}

fn gamutClip(lab: vec3f) -> vec3f {
    let rgb = oklabToLinearSrgb(lab);
    if all(vec3(0.0) <= rgb) && all(rgb <= vec3(1.0)) {
        return rgb;
    }

    let C = max(1e-5, length(lab.yz));
    let a_ = lab.y / C;
    let b_ = lab.z / C;

    let Ld = lab.x - 0.5;
    let alpha = 0.05;
    let e1 = 0.5 + abs(Ld) + alpha * C;
    let L0 = 0.5 * (1.0 + sign(Ld) * (e1 - sqrt(e1 * e1 - 2.0 * abs(Ld))));

    let t = gamutIntersect(a_, b_, lab.x, C, L0);
    let L_clipped = mix(L0, lab.x, t);
    let C_clipped = t * C;

    let clipped = vec3(L_clipped, C_clipped * a_, C_clipped * b_);
    return oklabToLinearSrgb(clipped);
}

fn gamutIntersect(a: f32, b: f32, L1: f32, C1: f32, L0: f32) -> f32 {
    let cusp = getCusp(a, b);
    if ((L1 - L0) * cusp.y - (cusp.x - L0) * C1) <= 0.0 {
        // Lower half
        return cusp.y * L0 / (C1 * cusp.x + cusp.y * (L0 - L1));
    } else {
        // Upper half
        return cusp.y * (L0 - 1.0) / (C1 * (cusp.x - 1.0) + cusp.y * (L0 - L1));
    }
}
        
fn getCusp(a: f32, b: f32) -> vec2f {
    // Convert a,b to index
    let h = 0.5 + atan2(b, a) / TAU;
    let float_idx = h * f32(srgb_cusp_lut_entries - 1u);
    let floor_idx = floor(float_idx);
    let lerp = float_idx - floor_idx;
    let idx = u32(floor_idx);

    // Look up index in table
    // This is a little fiddly because we have to pack two entries into one vector to satisfy alignment constraints
    let vec0 = srgb_cusp_lut[idx / 2u];
    let vec1 = srgb_cusp_lut[((idx + 1u) / 2u) % srgb_cusp_lut_entries];
    let first = vec2((idx & 1u) == 0u);
    let low = select(vec0.xy, vec0.zw, first);
    let high = select(vec1.zw, vec1.xy, first);

    // Lerp between low and high entries
    return mix(low, high, vec2(lerp));
}
