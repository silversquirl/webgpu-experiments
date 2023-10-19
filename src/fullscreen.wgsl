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
