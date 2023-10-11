struct SceneData {
    mvp: mat4x4<f32>,
    time: f32,
}

@group(0) @binding(0) var<uniform> scene: SceneData;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var heightmap: texture_2d<f32>;

override scale: f32;
override scaleY: f32 = 20.0;

struct VertexInput {
    @location(0) pos: vec3f,
}
struct InstanceInput {
    @location(1) pos: vec2f,
    @location(2) rot: f32,
    @location(3) height: f32,
}
struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) localY: f32,
}

@vertex
fn vertex(vert: VertexInput, inst: InstanceInput) -> VertexOutput {
    let uv = (inst.pos * vec2(scale) + vec2(1.0)) * vec2(0.5);
    let y: f32 = textureSampleBaseClampToEdge(heightmap, samp, uv).x;

    let sinR = sin(inst.rot);
    let cosR = cos(inst.rot);
    let rotM = mat3x3(
        cosR,
        0.0,
        sinR,
        //
        0.0,
        1.0,
        0.0,
        //
        -sinR,
        0.0,
        cosR,
    );

    let origin = vec3(inst.pos.x, y * scaleY, inst.pos.y);
    let scale = vec3(1.0, inst.height, 1.0);
    let pos = anim(inst.pos, scene.time * 1.3) * rotM * (vert.pos * scale) + origin;
    return VertexOutput(
        scene.mvp * vec4(pos, 1.0),
        vert.pos.y,
    );
}

fn anim(pos: vec2f, time: f32) -> mat3x3<f32> {
    return mat3x3(
        1.0,
        0.0,
        0.0,
        //
        0.3 * sin(time + 0.5 * pos.x),
        1.0,
        -0.3 * sin(time + 0.5 * pos.y),
        //
        0.0,
        0.0,
        1.0,
    );
}

@fragment
fn fragment(@location(0) localY: f32) -> @location(0) vec4f {
    const baseColor = vec4(0.0, 0.25, 0.0, 1.0);
    const tipColor = vec4(0.0, 1.0, 0.0, 1.0);
    return mix(baseColor, tipColor, localY);
}
