struct SceneData {
    mvp: mat4x4<f32>,
    inv_mvp: mat4x4<f32>,
    time: f32,
}

@group(0) @binding(0) var<uniform> scene: SceneData;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var heightmap: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

override width: u32;
override height_log2: u32;
override scale: f32 = 1.0;
override scaleY: f32 = 20.0;

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
    let height: f32 = textureSampleBaseClampToEdge(heightmap, samp, uv).x;

    let offset = vec2(0.5) * vec2<f32>(size);
    let xy = (coord - offset) * scale;

    return VertexOutput(
        scene.mvp * vec4(xy.x, height * scaleY, xy.y, 1.0),
        uv,
    );
}

@fragment
fn fragment(@location(0) uv: vec2f) -> @location(0) vec4f {
    return vec4(
        uv,
        0.0,
        1.0,
    );
}
