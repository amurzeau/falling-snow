
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
uniform sampler2D backgroundTextures[4];

vec4 get_background(sampler2D sampler, vec2 offset, float scale) {
    return texelFetch(sampler, ivec2((gl_FragCoord.xy + offset) / scale), 0);
}

void main() {
    vec4 texture1 = get_background(backgroundTextures[0], vec2(-10.0, 0.0), 2.0);
    vec4 texture3 = get_background(backgroundTextures[1], vec2(-256.0, 0.0), 2.0);
    vec4 texture4 = get_background(backgroundTextures[2], vec2(-600.0, 0.0), 1.5);

    vec4 blend = texture1.rgba;
    blend = mix(blend, texture3.rgba, texture3.a);
    blend = mix(blend, texture4.rgba, texture4.a);

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

int float2int(float v) {
    return int(round(v * 255.0));
}

int get_wrapped_falling_snow(vec2 offset) {
    float new_flake = step(scale.w, gl_FragCoord.y + offset.y);

    // Add a randomization to X component when it is a new_flake
    offset.x += new_flake * random.x * scale.x;

    vec2 wrapped_coord = mod((gl_FragCoord.xy + offset), scale.zw);

    // Snow flake position is encoded in first component only
    int value = float2int(texture(state, wrapped_coord / scale.xy).x);

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

// State bits:
// Bit 0: if 1: slow, far snow is present
// Bit 1: if 1: medium snow is present
// Bit 2: unused
// Bit 3: if 1: fast snow is present
float get_falling_snow_state(bool particule_fall_bottom_and_appears) {
    // Get state above
    // Color contains particule presence
    // Alpha contains if particule touched bottom
    int particle_slow =   get_wrapped_falling_snow(vec2(0.0, 1.0)) & 0x01;
    int particle_medium = get_wrapped_falling_snow(vec2(0.0, 2.0)) & 0x02;
    int particle_fast =   get_wrapped_falling_snow(vec2(0.0, 4.0)) & 0x08;

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

bool get_snow_flake_dropping() {
    int snow_present =
        float2int(get_snow_bottom(vec2(0.0, 1.0)).r) |
        float2int(get_snow_bottom(vec2(0.0, 0.0)).r);

    return (snow_present & 0x02) != 0;
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

    bool is_environment_above =
        get_environment(vec2(0.0, 1.0)) > 0.0;

    // Particule propagation:
    // A particule move to current pixel position when there is:
    // - no particule here currently
    // - no environment at position and above
    // - a particule just above
    // - a particule above right and right
    // - a particule above left and left and left-left, this check ensure sliding particule are not duplicated when they can go left and right
    bool particule_above = is_snow_arround(0.0, 1.0);
    bool particule_above_right = (is_snow_arround(1.0, 1.0) && is_snow_or_env_arround(1.0, 0.0));
    bool particule_above_left = (is_snow_arround(-1.0, 1.0) && is_snow_or_env_arround(-1.0, 0.0) && is_snow_or_env_arround(-2.0, 0.0));
    bool particule_move_to_here_and_appears =
        !is_snow_or_env_arround(0.0, 0.0) &&
        !is_environment_above && (
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
    bool is_snow_flake_dropping = get_snow_flake_dropping();


    // Particule appears because of snow falling and touching the bottom when:
    // - There is snow below but not where we are
    // - A medium particule fall down
    bool particule_fall_bottom_and_appears =
        is_snow_flake_dropping &&
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
    float ratio_height = clamp((gl_FragCoord.y - 70.0*2.0) / 40.0, 0.0, 1.0);
    vec2 smoke_origin = vec2(0.0, -1.0);
    smoke_origin = rotate(smoke_origin, (ratio_height*2.0 + 2.0*sin((0.1+ratio_height) * random.x * gl_FragCoord.y * gl_FragCoord.x)) * (-0.25 * 3.14159));
    smoke_origin = (1.0 + 5.0*ratio_height)*smoke_origin;
    float smoke_source = get_snow_bottom(smoke_origin).a * 1.01;
    float speed = (2.0 - ratio_height) * 0.1;
    float smoke_age = insideBox(gl_FragCoord.xy, vec2(10.0+15.0*2.0, 69.0*2.0), vec2(10.0+25.0*2.0, 69.0*2.0 + 2.0)) > 0.0 ? 1.0 :
    (
        min(current_smoke_age * (1.0 - speed) + speed * smoke_source, 1.0)
    );


    fragColor = vec4(
        get_falling_snow_state(particule_fall_bottom_and_appears),
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

uniform sampler2D backgroundTreesTexture;
uniform sampler2D maisonTexture;
uniform sampler2D sapinTexture;

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
    int snow_flakes = int(round(texel.r * 255.0));
    float particule_age = DecodeFloatRGB(texel.gb);

    texel.r = (snow_flakes & 0x01) != 0 ? 1.0 : 0.0;
    texel.g = (snow_flakes & 0x02) != 0 ? 1.0 : 0.0;
    texel.b = (snow_flakes & 0x08) != 0 ? 1.0 : 0.0;
    texel.a = particule_age;

    return texel;
}

vec3 processSnowFlake(float x, float y, float small, float medium, float large) {
    vec4 snow_state = get(vec2(x, y));

    return
        vec3(
            // Back snow flakes
            snow_state.r * small,
            // Mid snow flakes
            snow_state.g * medium,
            // Front snow flakes and Snow particles age
            snow_state.b * large + snow_state.a * small
        );
}

vec4 apply_light(vec4 background_color, vec2 light_position, vec4 color, float radius, float power) {
    vec2 distance = gl_FragCoord.xy - light_position.xy;
    float distance_pow2 = dot(distance, distance);

    return vec4(clamp(background_color.rgb * vec3(color * (radius / (1.0 + (distance_pow2 / power)))), 0.0, 1.0), background_color.a);
}

vec3 blendTexelFetch(vec3 blendedColor, sampler2D texture, vec2 offset, vec2 scale) {
    vec4 texel = texelFetch(texture, ivec2((gl_FragCoord.xy + offset) / scale), 0);
    return mix(blendedColor, texel.rgb * 0.5, texel.a);
}

vec3 blendTexture(vec3 blendedColor, sampler2D textureSampler, vec2 offset, vec2 scale) {
    vec4 texel = texture(textureSampler, (gl_FragCoord.xy + offset) / scale);
    return mix(blendedColor, texel.rgb * 0.5, texel.a);
}

const float pi2 = 2.0 * 3.14159;

vec2 eiffelLight(float time) {
    // Eiffel light

    float angle = time * pi2 - pi2/2.0;

    float cone_angle = pi2 / 300.0;
    float tower_z_distance = 100.0;

    vec2 beam_source_distance = gl_FragCoord.xy - vec2(600.0 + 61.5*1.5, 228.0*1.5);

    // Intersection between beam and camera vision
    // Vue de dessus, cas 1
    //
    //          *
    //         /
    //        /
    //       /
    //      /
    //     /
    // ----+------------------
    // Vue de dessus, cas 2
    //
    //         -*
    //       --
    //     +-
    //   --|
    // --  |
    // -----------------------
    float z_distance = tower_z_distance - beam_source_distance.x / tan(angle);
    float beam_distance = beam_source_distance.x / sin(angle);

    float light_distance = abs(beam_distance + z_distance);
    float distance_pow2 = dot(light_distance, light_distance);

    // For Y
    // Beam is a cone
    // Beam height depend on beam_distance, farther = larger
    float beam_height = tan(cone_angle) * beam_distance - 0.15;
    beam_height += step(0.0, beam_height)*2.0;

    float ratio_y = clamp(beam_height - abs(beam_source_distance.y), 0.0, 0.5);
    return vec2(ratio_y * 10000.0 / distance_pow2, angle);
}

vec4 blend_color() {
    vec3 snow_value;
    
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
    snow_value = ceil(min(snow_value, vec3(1.0)));

    // Texture with images
    vec4 background_texture = texture(backgroundTexture, gl_FragCoord.xy / scale.xy);

    //background_texture = mix(backgroud_fade_floor, background_texture, background_texture.a);
    vec4 texture_with_light = vec4(0.0);

    // Add lights

    // Ambiant light
    texture_with_light += background_texture * vec4(vec3(0.5), 1.0);

    float lightTime = time * 5.0;

    // 17 lights for house
    float light_power_1 = 1.0 * (step(0.5, fract(lightTime)));
    float light_power_2 = 1.0 * (1.0 - step(0.5, fract(lightTime)));

    texture_with_light += apply_light(background_texture, vec2(10.0 + 7.0  * 2.0, 33.0*2.0), vec4(0.573, 1.000, 0.000, 1.0), light_power_1, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 11.0 * 2.0, 33.0*2.0), vec4(1.000, 0.932, 0.000, 1.0), light_power_2, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 16.0 * 2.0, 33.0*2.0), vec4(1.000, 0.000, 0.043, 1.0), light_power_1, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 20.0 * 2.0, 33.0*2.0), vec4(0.000, 0.700, 1.000, 1.0), light_power_2, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 25.0 * 2.0, 33.0*2.0), vec4(1.000, 0.000, 0.585, 1.0), light_power_1, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 29.0 * 2.0, 33.0*2.0), vec4(1.000, 0.000, 0.440, 1.0), light_power_2, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 33.0 * 2.0, 33.0*2.0), vec4(1.000, 0.533, 0.000, 1.0), light_power_1, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 38.0 * 2.0, 33.0*2.0), vec4(0.573, 1.000, 0.000, 1.0), light_power_2, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 42.0 * 2.0, 33.0*2.0), vec4(1.000, 0.932, 0.000, 1.0), light_power_1, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 47.0 * 2.0, 33.0*2.0), vec4(1.000, 0.000, 0.043, 1.0), light_power_2, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 51.0 * 2.0, 33.0*2.0), vec4(0.000, 0.700, 1.000, 1.0), light_power_1, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 56.0 * 2.0, 33.0*2.0), vec4(1.000, 0.000, 0.585, 1.0), light_power_2, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 60.0 * 2.0, 33.0*2.0), vec4(1.000, 0.000, 0.440, 1.0), light_power_1, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 64.0 * 2.0, 33.0*2.0), vec4(1.000, 0.533, 0.000, 1.0), light_power_2, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 69.0 * 2.0, 33.0*2.0), vec4(0.573, 1.000, 0.000, 1.0), light_power_1, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 73.0 * 2.0, 33.0*2.0), vec4(1.000, 0.932, 0.000, 1.0), light_power_2, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 78.0 * 2.0, 33.0*2.0), vec4(1.000, 0.000, 0.043, 1.0), light_power_1, 30.0);
    texture_with_light += apply_light(background_texture, vec2(10.0 + 82.0 * 2.0, 33.0*2.0), vec4(0.000, 0.700, 1.000, 1.0), light_power_2, 30.0);

    // Sapin 2
    light_power_1 = 1.0 * (step(0.5, fract(lightTime + 0.4)));
    light_power_2 = 1.0 * (1.0 - step(0.5, fract(lightTime + 0.4)));
    texture_with_light += apply_light(background_texture, vec2(256.0 + 39.0*2.0, 19.0*2.0), vec4(0.573, 1.000, 0.000, 1.0), light_power_1, 1000.0);
    texture_with_light += apply_light(background_texture, vec2(256.0 + 92.0*2.0, 15.0*2.0), vec4(1.000, 0.932, 0.000, 1.0), light_power_2, 1000.0);
    texture_with_light += apply_light(background_texture, vec2(256.0 + 69.0*2.0, 35.0*2.0), vec4(1.000, 0.000, 0.043, 1.0), light_power_2, 1000.0);
    texture_with_light += apply_light(background_texture, vec2(256.0 + 72.0*2.0, 75.0*2.0), vec4(0.000, 0.700, 1.000, 1.0), light_power_1, 1000.0);
    texture_with_light += apply_light(background_texture, vec2(256.0 + 57.0*2.0, 83.0*2.0), vec4(1.000, 0.000, 0.585, 1.0), light_power_2, 1000.0);

    texture_with_light = clamp(texture_with_light, 0.0, 1.0);


    // Final color
    vec3 blendedColor = vec3(0.0);
    blendedColor = blendTexelFetch(blendedColor, traineauTexture, vec2(-traineauPosition), vec2(1.0));
    blendedColor = blendTexture(blendedColor, backgroundTreesTexture, vec2(0.0, -50.0), vec2(scale.z/5.0, scale.w/5.0));

    float ditheringRatio = fract(gl_FragCoord.x * 0.123456 + gl_FragCoord.y * 0.61432)*0.1 + 0.9;
    vec4 backgroud_fade_floor = vec4(vec3(smoothstep(200.0, 0.0, gl_FragCoord.y)/1.5 * ditheringRatio), 1.0);
    backgroud_fade_floor *= 1.0 - step(50.0, gl_FragCoord.y);

    // Eiffel lightning
    vec2 eiffelLighting = eiffelLight(time);

    if(eiffelLighting.y < -pi2/4.0 || eiffelLighting.y > pi2/4.0) {
        blendedColor += 1.0 * eiffelLighting.x;
        blendedColor = clamp(blendedColor, 0.0, 1.0);
    }
    
    blendedColor = mix(blendedColor, snow_value.xxx, snow_value.x);
    
    blendedColor = mix(blendedColor, backgroud_fade_floor.rgb, backgroud_fade_floor.a);
    
    blendedColor = blendTexelFetch(blendedColor, maisonTexture, vec2(-200.0, -35.0), vec2(0.6));
    blendedColor = blendTexelFetch(blendedColor, maisonTexture, vec2(-450.0, -35.0), vec2(0.6));
    blendedColor = blendTexelFetch(blendedColor, maisonTexture, vec2(-700.0, -35.0), vec2(0.6));

    blendedColor = blendTexelFetch(blendedColor, sapinTexture, vec2(-750.0, -30.0), vec2(0.5));

    blendedColor = blendTexelFetch(blendedColor, maisonTexture, vec2(-100.0, -25.0), vec2(0.7));
    blendedColor = blendTexelFetch(blendedColor, maisonTexture, vec2(-800.0, -25.0), vec2(0.7));
    blendedColor = blendTexelFetch(blendedColor, sapinTexture, vec2(-600.0, -25.0), vec2(0.6));

    blendedColor = blendTexelFetch(blendedColor, maisonTexture, vec2(-250.0, -15.0), vec2(0.8));
    blendedColor = blendTexelFetch(blendedColor, maisonTexture, vec2(-500.0, -15.0), vec2(0.8));
    blendedColor = blendTexelFetch(blendedColor, maisonTexture, vec2(-850.0, -15.0), vec2(0.8));


    blendedColor = mix(blendedColor, snow_value.yyy, snow_value.y);
    blendedColor = mix(blendedColor, texture_with_light.rgb, texture_with_light.a);
    blendedColor = mix(blendedColor, snow_value.zzz, snow_value.z);


    if(eiffelLighting.y >= -pi2/4.0 && eiffelLighting.y <= pi2/4.0) {
        blendedColor += 1.0 * eiffelLighting.x;
        blendedColor = clamp(blendedColor, 0.0, 1.0);
    }

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



export const fsLights = `#version 300 es
#ifdef GL_ES
precision mediump float;
#endif

in vec2 vTexCoord;
out vec4 fragColor;
uniform vec4 scale;
uniform vec3 color;
uniform float radius;
uniform float power;


void main() {
    vec2 distance = vTexCoord.xy - vec2(0.5, 0.5);
    float distance_pow2 = dot(distance, distance);
    fragColor = vec4(color, radius / (1.0 + (distance_pow2 / power)));
}
  `;