struct SceneData {
    mvp: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> scene: SceneData;

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) @interpolate(flat) vertId: u32,
}

override width: u32;
override height_log2: u32;

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
    let offset = vec2(0.5) * vec2<f32>(size);
    let xy = vec2<f32>(gridCoord(index)) - offset;
    return VertexOutput(
        scene.mvp * vec4(xy.x, 0.0, xy.y, 1.0),
        index,
    );
}

@fragment
fn fragment(@location(0) @interpolate(flat) vertId: u32) -> @location(0) vec4f {
    return vec4(vec3(f32(vertId & 1u)), 1.0);
}
