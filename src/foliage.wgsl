struct SceneData {
    mvp: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> scene: SceneData;

@vertex
fn vertex(@location(0) vertexPos: vec3f, @location(1) instancePos: vec2f) -> @builtin(position) vec4f {
    let pos = vertexPos * 0.1 + vec3(instancePos.x, 0.0, instancePos.y);
    return scene.mvp * vec4(pos, 1.0);
}

@fragment
fn fragment() -> @location(0) vec4f {
    return vec4(0.0, 1.0, 0.0, 1.0);
}
