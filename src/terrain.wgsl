struct SceneData {
    mvp: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> scene: SceneData;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var heightmap: texture_2d<f32>;
@group(0) @binding(3) var surface: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
    @location(1) @interpolate(flat) vertId: u32,
}

override width: u32;
override height_log2: u32;
override scale: f32 = 1.0;

fn gridCoord(i: u32) -> vec2u {
    let height = 1u << height_log2;
    let row = (i >> 1u) & (height - 1u);
    let col = i >> (1u + height_log2);
    let odd = (col & 1u) != 0u;

    return vec2(
        col + (i & 1u),
        select(row, height - row - 1u, odd),
    );
}

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
    let size = vec2(width, 1u << height_log2);

    let coord = vec2<f32>(gridCoord(index));
    let uv = coord / vec2<f32>(size);
    let height: vec4f = textureSampleBaseClampToEdge(heightmap, samp, uv);

    let offset = vec2(0.5) * vec2<f32>(size);
    let xy = (coord - offset) * scale;

    return VertexOutput(
        scene.mvp * vec4(xy.x, height.x * 10.0, xy.y, 1.0),
        uv,
        index,
    );
}

@fragment
fn fragment(@location(0) uv: vec2f, @location(1) @interpolate(flat) vertId: u32) -> @location(0) vec4f {
    let texel = textureSample(surface, samp, uv);
    return texel;
    // return vec4(value.x, f32(vertId & 1u), 0.0, 1.0);
}
