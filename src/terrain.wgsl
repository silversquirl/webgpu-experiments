struct SceneData {
    mvp: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> scene: SceneData;

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) xy: vec2f,
}

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> VertexOutput {
    let xyi = vec2(index & 1u, (index >> 1u) & 1u);
    let xy = vec2(2.0) * vec2<f32>(xyi) - vec2(1.0);

    return VertexOutput(
        scene.mvp * vec4(xy.x, 0.0, xy.y, 1.0),
        xy,
    );
}

@fragment
fn fragment(@location(0) xy: vec2f) -> @location(0) vec4f {
    // Fractional part of coordinate - gives coordinate within unit cell
    let fract = xy - floor(xy);
    // Distance from edge of unit cell
    let distV = vec2(1.0) - abs(2.0 * fract - 1.0);
    let dist = min(distV.x, distV.y);
    // Easing function to produce edge boundary
    let bound = smoothstep(0.0, 1.0, dist * 60.0);
    // let bound = log(dist) * 1.0 / 8.0 + 1;
    return vec4(vec3(bound), 1.0);
    // return select(vec4(1.0), vec4(0.0), any(bound > vec2(0.495)));
    // return vec4(vpos.xy / 2.0 + vec2(0.5), 0.0, 1.0);
}