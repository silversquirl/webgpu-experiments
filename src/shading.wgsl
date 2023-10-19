@group(0) @binding(0) var input: texture_2d<f32>;
@group(0) @binding(1) var depth: texture_depth_2d;

@group(1) @binding(0) var samp: sampler;
@group(1) @binding(1) var terrainSurface: texture_2d<f32>;

@fragment
fn fragment(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4f {
    let data = textureLoad(input, vec2<i32>(pixel.xy), 0);
    let mat = u32(data.w);

    let terrainTexel = textureSample(terrainSurface, samp, data.xy);
    if mat == 0u {
        // Sky
        return vec4(0.5, 0.8, 0.9, 1.0);
    } else if mat == 1u {
        // Terrain
        return terrainTexel;
    } else if mat == 2u {
        // Grass
        let localY = data.x;
        const baseColor = vec4(0.0, 0.25, 0.0, 1.0);
        const tipColor = vec4(0.0, 1.0, 0.0, 1.0);
        return mix(baseColor, tipColor, localY);
    } else {
        return data;
    }
}
