const srgb_cusp_lut_entries = 256u;
@group(0) @binding(0) var<uniform> srgb_cusp_lut: array<vec4f, srgb_cusp_lut_entries>;
@group(0) @binding(1) var input: texture_2d<f32>;

@fragment
fn fragment(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4f {
    let srgb_in = textureLoad(input, vec2<i32>(pixel.xy), 0);
    let rgb_in = srgbToLinear(srgb_in.xyz); // TODO: render in linear RGB
    let alpha = srgb_in.w;

    var lab = linearSrgbToOklab(rgb_in.xyz);
    lab *= vec3(1.2, 2.0, 2.0) + vec3(0.0, -0.3, 0.5);

    // TODO: gamut clipping
    let rgb_out = oklabToLinearSrgb(lab);
    return vec4(linearToSrgb(rgb_out), alpha);
}

// Cover the screen with a single tri
@vertex
fn vertex(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4f {
    let upos = vec2(
        4u * (idx & 1u),
        2u * (idx & 2u),
    );
    let pos = vec2<f32>(upos) - 1.0;
    return vec4(pos, 0.0, 1.0);
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

fn getCusp(a: f32, b: f32) -> vec2f {
    // Convert a,b to index
    let h = TAU / 2.0 + atan2(b, a);
    let float_idx = h * f32(srgb_cusp_lut_entries) / TAU;
    let floor_idx = floor(float_idx);
    let lerp = float_idx - floor_idx;
    let idx = u32(floor_idx);

    // Look up index in table
    // This is a little fiddly because we have to pack two entries into one vector to satisfy alignment constraints
    let vec0 = srgb_cusp_lut[idx / 2u];
    let vec1 = srgb_cusp_lut[((idx + 1u) / 2u) & (srgb_cusp_lut_entries - 1u)];
    let first = vec2((idx & 1u) == 0u);
    let low = select(vec0.xy, vec0.zw, first);
    let high = select(vec1.zw, vec1.yx, first);

    // Lerp between low and high entries
    return mix(low, high, vec2(lerp));
}
