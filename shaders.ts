
// Vertex shader program

export const vsSource = `#version 300 es
    #ifdef GL_ES
    precision mediump float;
    #endif

    in vec2 in_quad;
    uniform vec4 position;
    
    // Orthographic projection with left right bottom top = 0, 1, 0, 1
    const mat4 projection = mat4(
        2.0,    0.0,   0.0,  0.0,
        0.0,    2.0,   0.0,  0.0,
        0.0,    0.0,  -1.0,  0.0,
        -1.0,  -1.0,   0.0,  1.0);

    void main() {
        vec2 vertice = (in_quad * position.zw + position.xy);
        gl_Position = projection * vec4(in_quad, 0.0, 1.0);
        //vTexCoord = in_quad;
    }
  `;

// Fragment shader program


export const fsPreprocessEnvironmentSource = `#version 300 es
#ifdef GL_ES
precision highp float;
#endif

out vec4 fragColor;
uniform sampler2D backgroundTextures[2];

vec4 get_background(sampler2D sampler, vec2 offset, float scale) {
    return texelFetch(sampler, ivec2((gl_FragCoord.xy + offset) / scale), 0);
}

void main() {
    vec4 texture1 = get_background(backgroundTextures[0], vec2(-10.0, 0.0), 1.0);
    vec4 texture2 = get_background(backgroundTextures[1], vec2(-120.0, 0.0), 1.0);
    vec4 texture3 = get_background(backgroundTextures[1], vec2(-256.0, 0.0), 2.0);

    vec4 blend = texture1.rgba;
    blend = mix(blend, texture2.rgba, texture2.a);
    blend = mix(blend, texture3.rgba, texture3.a);

    fragColor = blend;
}
  `;

export const fsSource = `#version 300 es
#ifdef GL_ES
precision highp float;
precision highp sampler2D;
#endif

out vec4 fragColor;
uniform sampler2D state;
uniform sampler2D backgroundTexture;
uniform vec4 scale;
uniform vec2 random;
uniform float time;

const vec2 bitEnc = vec2(1.,255.) / 2.0;
const vec2 bitDec = 1./bitEnc;
vec2 EncodeFloatRGB (float v) {
    vec2 enc = bitEnc * v;
    enc = fract(enc);
    enc -= enc.yy * vec2(1./255., 0.).xy;
    return enc;
}
float DecodeFloatRGB (vec2 v) {
    return dot(v, bitDec);
}

int get_wrapped_falling_snow(vec2 offset) {
    float new_flake = step(scale.w, gl_FragCoord.y + offset.y);

    // Add a randomization to X component when it is a new_flake
    offset.x += new_flake * random.x * scale.x;

    vec2 wrapped_coord = mod((gl_FragCoord.xy + offset), scale.zw);

    // Snow flake position is encoded in first component only
    int value = int(texture(state, wrapped_coord / scale.xy).x * 255.0);
    if(new_flake > 0.0) {
        value |= 0x04;
    }
    return value;
}

vec4 get_snow_bottom(vec2 offset) {
    vec2 wrapped_coord = gl_FragCoord.xy + offset;
    wrapped_coord.x = mod(wrapped_coord.x, scale.z);
    return texture(state, (wrapped_coord / scale.xy));
}

float get_environment(vec2 offset) {
    vec2 wrapped_coord = gl_FragCoord.xy + offset;
    wrapped_coord.x = mod(wrapped_coord.x, scale.z);
    return texture(backgroundTexture, (wrapped_coord / scale.xy)).a;
}

float get_falling_snow_state() {
    // Get state above
    // Color contains particule presence
    // Alpha contains if particule touched bottom
    int particle_slow =   get_wrapped_falling_snow(vec2(0.0, 1.0)) & 0x1;
    int particle_medium = get_wrapped_falling_snow(vec2(0.0, 2.0)) & (0x2 | 0x4);
    int particle_fast =   get_wrapped_falling_snow(vec2(0.0, 4.0)) & 0x8;

    return float(
        particle_slow |
        particle_medium |
        particle_fast
    ) / 255.0;
}

float get_snow_arround(float x, float y) {
    return DecodeFloatRGB(get_snow_bottom(vec2(x, y)).gb);
}

bool is_snow_arround(float x, float y) {
    return
        DecodeFloatRGB(get_snow_bottom(vec2(x, y)).gb) > 0.0;
}

bool is_snow_or_env_arround(float x, float y) {
    return
        (DecodeFloatRGB(get_snow_bottom(vec2(x, y)).gb) +
        get_environment(vec2(x, y))) > 0.0;
}

vec2 encode_snow_particules(float snow_particule_age) {
    return EncodeFloatRGB(snow_particule_age);
}

bool get_snow_flake_dropped() {
    int snow_present =
        int(get_snow_bottom(vec2(0.0, 1.0)).r * 255.0) |
        int(get_snow_bottom(vec2(0.0, 0.0)).r * 255.0);

    return (snow_present & 0x2) != 0 && (snow_present & 0x4) != 0;
}

// return 1 if v inside the box, return 0 otherwise
float insideBox(vec2 v, vec2 bottomLeft, vec2 topRight) {
    vec2 s = step(bottomLeft, v) - step(topRight, v);
    return s.x * s.y;   
}

vec2 rotate(vec2 v, float a) {
	float s = sin(a);
	float c = cos(a);
	mat2 m = mat2(c, s, -s, c);
	return m * v;
}

void main() {
    // Snow particule gravity
    //vec2 gravity = vec2(0.0, -1.0);

    bool is_environment_below =
        get_environment(vec2(0.0, 0.0)) == 0.0 &&
        get_environment(vec2(0.0, -1.0)) > 0.0;

    bool is_environment_here =
        get_environment(vec2(0.0, 1.0)) == 0.0 &&
        get_environment(vec2(0.0, 0.0)) > 0.0;

    // Particule propagation:
    // A particule move to current pixel position when there is:
    // - no particule here currently
    // - no environment
    // - a particule just above
    // - a above right and right
    // - a above left and left and left-left, this check ensure sliding particule are not duplicated when they can go left and right
    bool particule_above = is_snow_arround(0.0, 1.0);
    bool particule_above_left = (is_snow_arround(-1.0, 1.0) && is_snow_or_env_arround(-1.0, 0.0) && is_snow_or_env_arround(-2.0, 0.0));
    bool particule_above_right = (is_snow_arround(1.0, 1.0) && is_snow_or_env_arround(1.0, 0.0));
    bool particule_move_to_here_and_appears =
        !is_snow_or_env_arround(0.0, 0.0) && (
            particule_above ||
            particule_above_left ||
            particule_above_right
        );
    float particule_age_origin = 
        !particule_move_to_here_and_appears ? get_snow_arround(0.0, 0.0) :
        (
            particule_above ? get_snow_arround(0.0, 1.0) :
                (particule_above_left ? get_snow_arround(-1.0, 1.0) : get_snow_arround(1.0, 1.0))
        );
    
    // Particule propagation:
    // A particule move out of current pixel position when there is:
    // - no particule below (particule fall)
    // - no particule below left / below right (particule fall and slide left / right)
    // - no environment below
    bool particule_move_out_and_disappears =
        is_snow_arround(0.0, 0.0) && (
            !is_snow_or_env_arround(0.0, -1.0) ||
            (is_snow_or_env_arround(0.0, -1.0) && !is_snow_or_env_arround(1.0, -1.0) && !is_snow_or_env_arround(1.0, 0.0)) ||
            (is_snow_or_env_arround(0.0, -1.0) && !is_snow_or_env_arround(-1.0, -1.0) && !is_snow_or_env_arround(-1.0, 0.0))
        );
    
    // Snow dropped on floor when there was a snow flake at our position or at above position.
    // Snow that drop on floor move at 2 pixels at once.
    bool is_snow_flake_dropped = get_snow_flake_dropped();


    // Particule appears because of snow falling and touching the bottom when:
    // - There is snow below but not where we are
    // - A medium particule fall down
    bool particule_fall_bottom_and_appears =
        is_snow_flake_dropped &&
        !is_snow_or_env_arround(0.0, 0.0) &&
        is_snow_or_env_arround(0.0, -1.0);

    // Particule is present if:
    // - There was a particule here and it didn't move
    // - A particule moved to here
    // - Snow fallen here
    // - We are at the bottom and we keep a covering of snow
    bool particule_is_present =
        (get_snow_arround(0.0, 0.0) > 0.0 && !particule_move_out_and_disappears) ||
        particule_move_to_here_and_appears ||
        particule_fall_bottom_and_appears ||
        gl_FragCoord.y < 1.0;

    float particule_age =
        (particule_fall_bottom_and_appears || gl_FragCoord.y < 1.0) ? 1.0
            : max(particule_age_origin - 0.0001, 0.0);

    float current_smoke_age = get_snow_bottom(vec2(0.0, 0.0)).a;
    float ratio_height = clamp((gl_FragCoord.y - 70.0) / 40.0, 0.0, 1.0);
    vec2 smoke_origin = vec2(0.0, -1.0);
    smoke_origin = rotate(smoke_origin, (ratio_height*2.0 + 2.0*sin((0.1+ratio_height) * random.x * gl_FragCoord.y * gl_FragCoord.x)) * (-0.25 * 3.14159));
    smoke_origin = (1.0 + 5.0*ratio_height)*smoke_origin;
    float smoke_source = get_snow_bottom(smoke_origin).a * 1.01;
    float speed = (2.0 - ratio_height) * 0.1;
    float smoke_age = insideBox(gl_FragCoord.xy, vec2(25.0, 69.0), vec2(35.0, 71.0)) > 0.0 ? 1.0 :
    (
        min(current_smoke_age * (1.0 - speed) + speed * smoke_source, 1.0)
    );


    fragColor = vec4(
        get_falling_snow_state(),
        encode_snow_particules(particule_is_present ? particule_age : 0.0),
        smoke_age
    );
}
  `;


  // * * *
  //  ***
  // *****
  //  ***
  // * * *


export const fsCopySource = `#version 300 es
#ifdef GL_ES
precision mediump float;
#endif

out vec4 fragColor;
uniform sampler2D state;
uniform sampler2D backgroundTexture;
uniform vec4 scale;
uniform float time;

uniform sampler2D traineauTexture;
uniform vec2 traineauPosition;

const vec2 bitEnc = vec2(1.,255.) / 2.0;
const vec2 bitDec = 1./bitEnc;
vec2 EncodeFloatRGB (float v) {
    vec2 enc = bitEnc * v;
    enc = fract(enc);
    enc -= enc.yy * vec2(1./255., 0.).xy;
    return enc;
}
float DecodeFloatRGB (vec2 v) {
    return dot(v, bitDec);
}

vec4 get(vec2 offset) {
    vec4 texel = texture(state, (gl_FragCoord.xy + offset) / scale.xy);
    int snow_flakes = int(texel.r * 255.0);
    float particule_age = DecodeFloatRGB(texel.gb);

    texel.r = (snow_flakes & 0x01) != 0 ? 1.0 : 0.0;
    texel.g = (snow_flakes & 0x02) != 0 ? 1.0 : 0.0;
    texel.b = (snow_flakes & 0x08) != 0 ? 1.0 : 0.0;
    texel.a = particule_age;

    return texel;
}

vec2 processSnowFlake(float x, float y, float small, float medium, float large) {
    vec4 snow_state = get(vec2(x, y));

    return
        vec2(
            // Back snow flakes
            snow_state.r * small + snow_state.g * medium,
            // Front snow flakes and Snow particles age
            snow_state.b * large + snow_state.a * small
        );
}

vec4 apply_light(vec4 background_color, vec2 light_position, vec4 color, float radius, float power) {
    vec2 distance = gl_FragCoord.xy - light_position.xy;
    float distance_pow2 = dot(distance, distance);

    return mix(background_color, color, radius / (1.0 + (distance_pow2 / power)));
}

vec4 blend_color() {
    vec2 snow_value;
    
    snow_value =  processSnowFlake(-2.0, -2.0, 0.0, 0.0, 1.0);
    snow_value += processSnowFlake(0.0, -2.0, 0.0, 0.0, 1.0);
    snow_value += processSnowFlake(2.0, -2.0, 0.0, 0.0, 1.0);
    
    snow_value += processSnowFlake(-1.0, -1.0, 0.0, 0.0, 1.0);
    snow_value += processSnowFlake(0.0, -1.0, 0.0, 1.0, 1.0);
    snow_value += processSnowFlake(1.0, -1.0, 0.0, 1.0, 1.0);
    
    snow_value += processSnowFlake(-2.0, 0.0, 0.0, 0.0, 1.0);
    snow_value += processSnowFlake(-1.0, 0.0, 0.0, 0.0, 1.0);
    snow_value += processSnowFlake(0.0, 0.0, 1.0, 1.0, 1.0);
    snow_value += processSnowFlake(1.0, 0.0, 0.0, 1.0, 1.0);
    snow_value += processSnowFlake(2.0, 0.0, 0.0, 0.0, 1.0);
    
    snow_value += processSnowFlake(-1.0, 1.0, 0.0, 0.0, 1.0);
    snow_value += processSnowFlake(0.0, 1.0, 0.0, 0.0, 1.0);
    snow_value += processSnowFlake(1.0, 1.0, 0.0, 0.0, 1.0);
    
    snow_value += processSnowFlake(-2.0, 2.0, 0.0, 0.0, 1.0);
    snow_value += processSnowFlake(0.0, 2.0, 0.0, 0.0, 1.0);
    snow_value += processSnowFlake(2.0, 2.0, 0.0, 0.0, 1.0);

    // If snow particule age > 0.0, then make it 1.0
    snow_value = ceil(min(snow_value, vec2(1.0)));

    // Texture with images
    vec4 texture_with_light = texture(backgroundTexture, gl_FragCoord.xy / scale.xy);
    // Add lights

    // 17 lights for house
    float light_power_1 = 1.0 * (step(0.5, time));
    float light_power_2 = 1.0 * (1.0 - step(0.5, time));

    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 7.0 , 33.0), vec4(0.573, 1.000, 0.000, 1.0), light_power_1, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 11.0, 33.0), vec4(1.000, 0.932, 0.000, 1.0), light_power_2, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 16.0, 33.0), vec4(1.000, 0.000, 0.043, 1.0), light_power_1, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 20.0, 33.0), vec4(0.000, 0.700, 1.000, 1.0), light_power_2, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 25.0, 33.0), vec4(1.000, 0.000, 0.585, 1.0), light_power_1, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 29.0, 33.0), vec4(1.000, 0.000, 0.440, 1.0), light_power_2, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 33.0, 33.0), vec4(1.000, 0.533, 0.000, 1.0), light_power_1, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 38.0, 33.0), vec4(0.573, 1.000, 0.000, 1.0), light_power_2, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 42.0, 33.0), vec4(1.000, 0.932, 0.000, 1.0), light_power_1, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 47.0, 33.0), vec4(1.000, 0.000, 0.043, 1.0), light_power_2, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 51.0, 33.0), vec4(0.000, 0.700, 1.000, 1.0), light_power_1, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 56.0, 33.0), vec4(1.000, 0.000, 0.585, 1.0), light_power_2, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 60.0, 33.0), vec4(1.000, 0.000, 0.440, 1.0), light_power_1, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 64.0, 33.0), vec4(1.000, 0.533, 0.000, 1.0), light_power_2, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 69.0, 33.0), vec4(0.573, 1.000, 0.000, 1.0), light_power_1, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 73.0, 33.0), vec4(1.000, 0.932, 0.000, 1.0), light_power_2, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 78.0, 33.0), vec4(1.000, 0.000, 0.043, 1.0), light_power_1, 6.0);
    texture_with_light = apply_light(texture_with_light, vec2(10.0 + 82.0, 33.0), vec4(0.000, 0.700, 1.000, 1.0), light_power_2, 6.0);

    // Sapin 1
    light_power_1 = 1.0 * (step(0.5, fract(time + 0.7)));
    light_power_2 = 1.0 * (1.0 - step(0.5, fract(time + 0.7)));
    texture_with_light = apply_light(texture_with_light, vec2(120.0 + 39.0, 19.0), vec4(0.573, 1.000, 0.000, 1.0), light_power_1, 120.0);
    texture_with_light = apply_light(texture_with_light, vec2(120.0 + 92.0, 15.0), vec4(1.000, 0.932, 0.000, 1.0), light_power_2, 120.0);
    texture_with_light = apply_light(texture_with_light, vec2(120.0 + 69.0, 35.0), vec4(1.000, 0.000, 0.043, 1.0), light_power_2, 120.0);
    texture_with_light = apply_light(texture_with_light, vec2(120.0 + 72.0, 75.0), vec4(0.000, 0.700, 1.000, 1.0), light_power_1, 120.0);
    texture_with_light = apply_light(texture_with_light, vec2(120.0 + 57.0, 83.0), vec4(1.000, 0.000, 0.585, 1.0), light_power_2, 120.0);

    // Sapin 2
    light_power_1 = 1.0 * (step(0.5, fract(time + 0.4)));
    light_power_2 = 1.0 * (1.0 - step(0.5, fract(time + 0.4)));
    texture_with_light = apply_light(texture_with_light, vec2(256.0 + 39.0*2.0, 19.0*2.0), vec4(0.573, 1.000, 0.000, 1.0), light_power_1, 240.0);
    texture_with_light = apply_light(texture_with_light, vec2(256.0 + 92.0*2.0, 15.0*2.0), vec4(1.000, 0.932, 0.000, 1.0), light_power_2, 240.0);
    texture_with_light = apply_light(texture_with_light, vec2(256.0 + 69.0*2.0, 35.0*2.0), vec4(1.000, 0.000, 0.043, 1.0), light_power_2, 240.0);
    texture_with_light = apply_light(texture_with_light, vec2(256.0 + 72.0*2.0, 75.0*2.0), vec4(0.000, 0.700, 1.000, 1.0), light_power_1, 240.0);
    texture_with_light = apply_light(texture_with_light, vec2(256.0 + 57.0*2.0, 83.0*2.0), vec4(1.000, 0.000, 0.585, 1.0), light_power_2, 240.0);


    vec3 blendedColor = texelFetch(traineauTexture, ivec2(gl_FragCoord.xy - traineauPosition), 0).rgb;
    blendedColor = mix(blendedColor, snow_value.xxx, snow_value.x);
    blendedColor = mix(blendedColor, texture_with_light.rgb, texture_with_light.a);
    blendedColor = mix(blendedColor, snow_value.yyy, snow_value.y);

    // Smoke
    vec4 texel = texture(state, gl_FragCoord.xy / scale.xy);
    blendedColor = mix(blendedColor, vec3(0.8), (texel.a));

    return vec4(blendedColor, 1.0);
}

void main() {
    fragColor = blend_color();
    // fragColor = texture(state, (gl_FragCoord.xy) / scale.xy);
    // fragColor.a = 1.0;
}
  `;
