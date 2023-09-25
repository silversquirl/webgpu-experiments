struct SceneData {
    mvp: mat4x4<f32>,
    time: f32,
}

@group(0) @binding(0) var<uniform> scene: SceneData;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var heightmap: texture_2d<f32>;

override scale: f32;
override scaleY: f32 = 20.0;

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) localY: f32,
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
        //
        0.0,
        1.0,
        0.0,
        //
        -sinR,
        0.0,
        cosR,
    );

    let origin = vec3(instancePos.x, height * scaleY, instancePos.y);
    let pos = anim(instancePos, scene.time) * rotM * vertexPos + origin;
    return VertexOutput(
        scene.mvp * vec4(pos, 1.0),
        vertexPos.y,
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
