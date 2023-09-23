

@vertex
fn vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
    let xyi = vec2(index & 1u, (index >> 1u) & 1u);
    let xy = vec2(2.0) * vec2<f32>(xyi) - vec2(1.0);
    let pos = vec4(xy, 0.0, 1.0);

    return pos;
}

@fragment
fn fragment() -> @location(0) vec4f {
    return vec4(1.0, 1.0, 1.0, 1.0);
}
