struct SceneData {
    mvp: mat4x4<f32>,
    inv_mvp: mat4x4<f32>,
    time: f32,
}

@group(0) @binding(0) var<uniform> scene: SceneData;

struct VertexOutput {
    @builtin(position) pos: vec4f,
    @location(0) pos_frag: vec3f,
    @location(1) camPos: vec3f,
}

override shell_count: u32;
override blade_density: f32;
override total_height: f32;
override plane_size: f32;

@vertex
fn vertex(@builtin(vertex_index) vert_idx: u32, @builtin(instance_index) instance: u32) -> VertexOutput {
    let uv_i = vec2(vert_idx & 1u, (vert_idx >> 1u) & 1u);
    let uv = vec2<f32>(uv_i);
    let height = total_height;
    let pos = vec3(uv * plane_size, height).xzy;
    let projectedPos = scene.mvp * vec4(pos, 1.0);

    var camPos = scene.inv_mvp * vec4(0.0, 0.0, 0.0, 1.0);
    camPos /= camPos.w;

    return VertexOutput(
        projectedPos,
        pos * vec3(blade_density, 1.0, blade_density),
        camPos.xyz,
    );
}

@fragment
fn fragment(@location(0) startPos: vec3f, @location(1) camPos: vec3f) -> @location(0) vec4f {
    let grassSpaceCamPos = camPos * vec3(blade_density, 1.0, blade_density);
    let dir = normalize(startPos - grassSpaceCamPos);

    let height = raycast(startPos, dir);
    if height < 0.0 {
        // return vec4(0.0);
        discard;
    }
    return vec4(height, 0.0, 0.0, 2.0);

    // let radius = textureLoad(noiseTexture, vec2<i32>(pos), i32(shell), 0).x;
    // if dot(localPos, localPos) >= radius {
    //     discard;
    // }
    // return vec4(1.0 - radius, 0.0, 0.0, 2.0);
}

fn raycast(startPos: vec3f, dir: vec3f) -> f32 {
    let tDelta = 1.0 / abs(dir * blade_density);
    var tMaxX = 0.0;
    var tMaxY = 0.0;
    var t = 0.0;
    var pos = startPos;

    let size = plane_size * blade_density;
    let max_iter = u32(size * size);
    for (var i = 0u; i < max_iter; i++) {
        if tMaxX < tMaxY {
            tMaxX += tDelta.x;
            t = tMaxX;
        } else {
            tMaxY += tDelta.y;
            t = tMaxY;
        }

        let nextPos = startPos + dir * t;
        if invalidPos(nextPos) {
            return -1.0;
        }

        let value = floatHash2(vec2<u32>(pos.xz));
        let height = pos.y / total_height;
        let radius = 1.0 - height;
        let circlePos = (pos.xz - floor(pos.xz) - 0.5) * 2.0;
        if value >= height && dot(circlePos, circlePos) < radius * radius {
            return height;
        }

        pos = nextPos;
    }
    return 0.0;
}
fn invalidPos(pos: vec3f) -> bool {
    let size = plane_size * blade_density;
    return any(pos < vec3(0.0)) || any(pos.xz >= vec2(size)) || pos.y > total_height ;
}

// PCG-based hash function; pareto-optimal according to https://jcgt.org/published/0009/03/02/
fn pcgHash(input: u32) -> u32 {
    let state = input * 747796405u + 2891336453u;
    let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

// Call PCG hash and convert result to float in range [0..1)
fn floatHash(input: u32) -> f32 {
    let hash = pcgHash(input);
    return f32(hash >> 8u) * 0x1.0p-24;
}
fn floatHash2(input: vec2u) -> f32 {
    return floatHash(input.x + pcgHash(input.y));
}
