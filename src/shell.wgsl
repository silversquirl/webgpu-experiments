struct SceneData {
    mvp: mat4x4<f32>,
    time: f32,
}

@group(0) @binding(0) var<uniform> scene: SceneData;
@group(0) @binding(1) var noiseTexture: texture_2d_array<f32>;

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
    @location(1) @interpolate(flat) shell: u32,
}

override shell_count: u32;
override blade_density: f32;
override total_height: f32;
override plane_size: f32;

@vertex
fn vertex(@builtin(vertex_index) vert_idx: u32, @builtin(instance_index) instance: u32) -> VertexOutput {
    let shell = shell_count - instance - 1u; // Render from top to bottom - helps with overdraw
    let uv_i = vec2(vert_idx & 1u, (vert_idx >> 1u) & 1u);
    let uv = vec2<f32>(uv_i);
    let height = f32(shell) * (total_height / f32(shell_count));
    let pos = scene.mvp * vec4(uv * plane_size, height, 1.0).xzyw;
    return VertexOutput(pos, uv, shell);
}

@fragment
fn fragment(@location(0) uv: vec2f, @location(1) @interpolate(flat) shell: u32) -> @location(0) vec4f {
    let scaledPos = uv * plane_size * blade_density;
    let localPos = (scaledPos - floor(scaledPos) - 0.5) * 2.0;

    let radius = textureLoad(noiseTexture, vec2<i32>(scaledPos), i32(shell), 0).x;
    if dot(localPos, localPos) >= radius {
        discard;
    }
    return vec4(1.0 - radius, 0.0, 0.0, 2.0);
}

@group(0) @binding(0) var outputTexture: texture_storage_2d_array<r32float, write>;

@compute
@workgroup_size(1)
fn genNoiseTexture(@builtin(global_invocation_id) pos: vec3u) {
    let value = floatHash2(pos.xy);
    let height = f32(pos.z) / f32(shell_count);
    let radius = select(1.0 - height, 0.0, value < height);
    textureStore(outputTexture, vec2<i32>(pos.xy), i32(pos.z), vec4(radius));
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
