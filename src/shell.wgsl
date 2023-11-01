struct SceneData {
    mvp: mat4x4<f32>,
    time: f32,
}

@group(0) @binding(0) var<uniform> scene: SceneData;

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
    @location(1) @interpolate(flat) inst: u32,
}

override shells: u32;
override blade_density: f32 = 10.0;
override total_height: f32 = 2.0;
override plane_size: f32 = 5.0;

@vertex
fn vertex(@builtin(vertex_index) vert_idx: u32, @builtin(instance_index) inst: u32) -> VertexOutput {
    let uv_i = vec2((vert_idx & 1u) << 1u, vert_idx & 2u);
    let uv = vec2<f32>(uv_i);
    let height = f32(inst) * (total_height / f32(shells));
    let pos = scene.mvp * vec4(uv * plane_size, height, 1.0).xzyw;
    return VertexOutput(pos, uv, inst);
}

@fragment
fn fragment(@location(0) uv: vec2f, @location(1) @interpolate(flat) inst: u32) -> @location(0) vec4f {
    let scaledPos = uv * plane_size * blade_density;
    let localPos = (scaledPos - floor(scaledPos) - 0.5) * 2.0;

    let x = floatHash2(vec2<u32>(scaledPos));
    let height = f32(inst) / f32(shells);
    let radius = 1.0 - height;
    if x < height || dot(localPos, localPos) >= radius * radius {
        discard;
    }
    return vec4(height, 0.0, 0.0, 2.0);
}

// PCG-based hash function; pareto-optimal according to https://jcgt.org/published/0009/03/02/
fn pcgHash(input: u32) -> u32 {
    let state = input * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

// Call PCG hash and convert result to float in range [0..1)
fn floatHash(input: u32) -> f32 {
    let hash = pcgHash(input);
    return f32(hash >> 8u) * 0x1.0p-24;
}
fn floatHash2(input: vec2u) -> f32 {
    return floatHash(input.x + pcgHash(input.y));
}
