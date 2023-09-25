struct SceneData {
    mvp: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> scene: SceneData;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var heightmap: texture_2d<f32>;

override scale: f32;
override scaleY: f32 = 20.0;

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) height: f32,
    @location(1) uv: vec2f,
}

@vertex
fn vertex(@location(0) vertexPos: vec3f, @location(1) instancePos: vec2f, @location(2) instanceRot: f32) -> VertexOutput {
    let uv = (instancePos * vec2(scale) + vec2(1.0)) * vec2(0.5);
    let height: f32 = textureSampleBaseClampToEdge(heightmap, samp, uv).x;

    let sinR = sin(instanceRot);
    let cosR = cos(instanceRot);
    let rotM = mat3x3(
        cosR,
        0.0,
        sinR,
        0.0,
        1.0,
        0.0,
        -sinR,
        0.0,
        cosR,
    );

    let origin = vec3(instancePos.x, height * scaleY, instancePos.y);
    let pos = rotM * vertexPos * 0.1 + origin;
    return VertexOutput(
        scene.mvp * vec4(pos, 1.0),
        height,
        uv
    );
}

@fragment
fn fragment(@location(0) height: f32, @location(1) uv: vec2f) -> @location(0) vec4f {
    return vec4(0.0, 1.0, 0.0, 1.0);
    // let x = select(uv, vec2(1.0) + uv, uv < vec2(0.0));
    // return vec4(x, 0.0, 0.0);
}
