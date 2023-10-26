@group(0) @binding(0) var<uniform> inverseProjection: mat4x4<f32>;
@group(0) @binding(1) var colorTex: texture_2d<f32>;
@group(0) @binding(2) var depthTex: texture_depth_2d;

override near: f32 = 35.0;
override far: f32 = 45.0;

@fragment
fn fragment(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4f {
    // Fetch color and depth data for the current fragment
    let xy = vec2<i32>(pixel.xy);
    let color = textureLoad(colorTex, xy, 0);
    let depth = textureLoad(depthTex, xy, 0);

    // Compute camera-local coordinates
    let size = vec2<f32>(textureDimensions(colorTex));
    let viewPos = (pixel.xy / size - 0.5) * vec2(2.0, -2.0);
    var pos = inverseProjection * vec4(
        viewPos,
        depth,
        1.0
    );
    pos /= pos.w;

    // Compute fog colour for current elevation
    // FIXME: I'm not sure why the y coord makes a circle pattern in the sky
    //        Ignoring for now as it's relatively subtle
    let fogColor = mix(white, blue, normalize(pos.xyz).y);

    // Compute fog based on distance from camera
    let dist = min(far, length(pos.xyz));
    let f = smoothstep(near, far, dist);
    return mix(color, fogColor, vec4(f));
}

const white = vec4(1.0);
const blue = vec4(0.5, 0.8, 0.9, 1.0);
