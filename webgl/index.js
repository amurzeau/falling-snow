var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
function addImageProcess(src) {
    return new Promise((resolve, reject) => {
        let img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.crossOrigin = "anonymous";
        img.src = src;
    });
}
function getImageData(image) {
    return __awaiter(this, void 0, void 0, function* () {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        // 2) Copy your image data into the canvas
        return addImageProcess(image);
    });
}
// Vertex shader program
const vsSource = `#version 300 es
    #ifdef GL_ES
    precision mediump float;
    #endif

    in vec2 in_quad;

    void main() {
      gl_Position = vec4(in_quad, 0.0, 1.0);
    }
  `;
// Fragment shader program
const fsPreprocessEnvironmentSource = `#version 300 es
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
const fsSource = `#version 300 es
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
const fsCopySource = `#version 300 es
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
//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    // Send the source to the shader object
    gl.shaderSource(shader, source);
    // Compile the shader program
    gl.compileShader(shader);
    // See if it compiled successfully
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}
function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    // Create the shader program
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    // If creating the shader program failed, alert
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    return shaderProgram;
}
function initPositionBuffer(gl) {
    // Create a buffer for the square's positions.
    const positionBuffer = gl.createBuffer();
    // Select the positionBuffer as the one to apply buffer
    // operations to from here out.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    // Now create an array of positions for the square.
    const positions = [-1, -1, 1, -1, -1, 1, 1, 1];
    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    return positionBuffer;
}
function nearestPowerOf2(n) {
    return 1 << 32 - Math.clz32(n);
}
function texture(gl, width, height) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return tex;
}
;
function textureFromImage(gl, image) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return tex;
}
;
function prepareVertices(gl, quad_uniform) {
    const positionBuffer = initPositionBuffer(gl);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(quad_uniform);
    gl.vertexAttribPointer(quad_uniform, 2, gl.FLOAT, false, 0, 0);
}
function prepareViewport(gl, canvas) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, canvas.width, canvas.height);
}
let snow_count = 0;
function initializeSnowState(gl, canvas, state) {
    let rand = new Uint8Array(canvas.width * (canvas.height + 1) * 4);
    for (let i = 0; i < rand.length; i += 4) {
        rand[i + 0] =
            ((Math.random() < 0.0006 ? 1 : 0) << 0) |
                ((Math.random() < 0.00015 ? 3 : 0) << 1) |
                ((Math.random() < 0.0001 ? 1 : 0) << 3);
        if (rand[i + 0] & 0x6) {
            snow_count++;
        }
        rand[i + 1] = 0;
        rand[i + 2] = 0;
        rand[i + 3] = 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, state);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, canvas.width, canvas.height + 1, gl.RGBA, gl.UNSIGNED_BYTE, rand);
}
function prepareEnvironment(gl, backgroundTexture, framebuffer) {
    return __awaiter(this, void 0, void 0, function* () {
        const shaderPreprocessEnvironmentProgram = initShaderProgram(gl, vsSource, fsPreprocessEnvironmentSource);
        const programProcessEnvironmentInfo = {
            program: shaderPreprocessEnvironmentProgram,
            attribLocations: {
                quad: gl.getAttribLocation(shaderPreprocessEnvironmentProgram, "in_quad"),
            },
            uniformLocations: {
                backgroundTextures: gl.getUniformLocation(shaderPreprocessEnvironmentProgram, "backgroundTextures"),
            },
        };
        let maison_image = yield getImageData("maison.png");
        let sapin_image = yield getImageData("sapin.png");
        gl.activeTexture(gl.TEXTURE0 + 1);
        const maisonTexture = textureFromImage(gl, maison_image);
        gl.activeTexture(gl.TEXTURE0 + 2);
        const sapinTexture = textureFromImage(gl, sapin_image);
        // Render to texture
        gl.useProgram(programProcessEnvironmentInfo.program);
        // Set the shader uniforms
        gl.uniform1iv(programProcessEnvironmentInfo.uniformLocations.backgroundTextures, [1, 2]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, backgroundTexture, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(maisonTexture);
        gl.deleteTexture(sapinTexture);
        gl.deleteProgram(programProcessEnvironmentInfo.program);
    });
}
function monitorFPS(canvas, runtimeState) {
    let fpsElement = document.getElementById('fps');
    setInterval(function () {
        let count = runtimeState.frameCount;
        runtimeState.frameCount = 0;
        fpsElement.textContent = "FPS: " + count + " " + window.devicePixelRatio + " " + canvas.width + " " + canvas.height + " " +
            (canvas.width * canvas.height / snow_count);
    }, 1000);
}
function handleInteractions(canvas, runtimeState) {
    let generateSnowByMouseInterval = undefined;
    function handleMouseEvent(event) {
        if (!(event.buttons & 1)) {
            return;
        }
        if (runtimeState.x != -1 || runtimeState.y != -1) {
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const localY = window.innerHeight - (event.clientY - rect.top);
        runtimeState.x = localX;
        runtimeState.y = localY;
        if (generateSnowByMouseInterval !== undefined) {
            clearInterval(generateSnowByMouseInterval);
        }
        generateSnowByMouseInterval = setInterval(function () {
            runtimeState.x = localX;
            runtimeState.y = localY;
        }, 50);
    }
    canvas.addEventListener('mousedown', handleMouseEvent);
    canvas.addEventListener('mouseup', function (e) {
        if (generateSnowByMouseInterval !== undefined) {
            clearInterval(generateSnowByMouseInterval);
        }
    });
    canvas.addEventListener('mousemove', handleMouseEvent);
    function handleTouchEvent(event) {
        if (runtimeState.x != -1 || runtimeState.y != -1) {
            return;
        }
        if (event.touches.length == 0)
            return;
        const touchEvent = event.touches[0];
        const rect = canvas.getBoundingClientRect();
        const localX = touchEvent.clientX - rect.left;
        const localY = window.innerHeight - (touchEvent.clientY - rect.top);
        runtimeState.x = localX;
        runtimeState.y = localY;
        if (generateSnowByMouseInterval !== undefined) {
            clearInterval(generateSnowByMouseInterval);
        }
        generateSnowByMouseInterval = setInterval(function () {
            runtimeState.x = localX;
            runtimeState.y = localY;
        }, 50);
        event.preventDefault();
        event.stopPropagation();
    }
    canvas.addEventListener("touchstart", handleTouchEvent);
    canvas.addEventListener("touchmove", function (event) {
        handleTouchEvent(event);
    });
    canvas.addEventListener("touchend", function (event) {
        if (generateSnowByMouseInterval !== undefined) {
            clearInterval(generateSnowByMouseInterval);
        }
    });
    canvas.addEventListener("touchcancel", function (event) {
        if (generateSnowByMouseInterval !== undefined) {
            clearInterval(generateSnowByMouseInterval);
        }
    });
}
(() => __awaiter(this, void 0, void 0, function* () {
    const canvas = document.getElementById('canvas');
    if (!canvas)
        return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    while (canvas.width > 512 && canvas.height > 512) {
        canvas.width /= 2.0;
        canvas.height /= 2.0;
    }
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
    gl.disable(gl.DEPTH_TEST);
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    const shaderCopyProgram = initShaderProgram(gl, vsSource, fsCopySource);
    // Collect all the info needed to use the shader program.
    // Look up which attribute our shader program is using
    // for aVertexPosition and look up uniform locations.
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            quad: gl.getAttribLocation(shaderProgram, "in_quad"),
        },
        uniformLocations: {
            scale: gl.getUniformLocation(shaderProgram, "scale"),
            state: gl.getUniformLocation(shaderProgram, "state"),
            random: gl.getUniformLocation(shaderProgram, "random"),
            time: gl.getUniformLocation(shaderProgram, "time"),
            backgroundTexture: gl.getUniformLocation(shaderProgram, "backgroundTexture"),
        },
    };
    const programCopyInfo = {
        program: shaderCopyProgram,
        attribLocations: {
            quad: gl.getAttribLocation(shaderCopyProgram, "in_quad"),
        },
        uniformLocations: {
            scale: gl.getUniformLocation(shaderCopyProgram, "scale"),
            state: gl.getUniformLocation(shaderCopyProgram, "state"),
            time: gl.getUniformLocation(shaderCopyProgram, "time"),
            backgroundTexture: gl.getUniformLocation(shaderCopyProgram, "backgroundTexture"),
            traineauTexture: gl.getUniformLocation(shaderCopyProgram, "traineauTexture"),
            traineauPosition: gl.getUniformLocation(shaderCopyProgram, "traineauPosition"),
        },
    };
    const framebuffer = gl.createFramebuffer();
    const textureWidth = nearestPowerOf2(canvas.width);
    const textureHeight = nearestPowerOf2(canvas.height);
    prepareVertices(gl, programInfo.attribLocations.quad);
    // Clear the canvas before we start drawing on it.
    prepareViewport(gl, canvas);
    // Double buffering texture, one for the previous state, one for the next state
    // RGB contains the 3 layers snow
    const state = [
        texture(gl, textureWidth, textureHeight),
        texture(gl, textureWidth, textureHeight)
    ];
    let currentTextureIndex = 0;
    // Initialize snow, each white dot is a snow drawn by the fragment shader
    initializeSnowState(gl, canvas, state[currentTextureIndex]);
    const backgroundTexture = texture(gl, textureWidth, textureHeight);
    yield prepareEnvironment(gl, backgroundTexture, framebuffer);
    // Prepare textures for drawing main loop
    let traineau_image = yield getImageData("traineau.png");
    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
    gl.activeTexture(gl.TEXTURE0 + 2);
    textureFromImage(gl, traineau_image);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(programInfo.program);
    // Set the shader uniforms
    gl.uniform4f(programInfo.uniformLocations.scale, textureWidth, textureHeight, canvas.width, canvas.height);
    gl.uniform1i(programInfo.uniformLocations.state, 0);
    gl.uniform1i(programInfo.uniformLocations.state, 0);
    gl.uniform1i(programInfo.uniformLocations.backgroundTexture, 1);
    gl.useProgram(programCopyInfo.program);
    // Set the shader uniforms
    gl.uniform4f(programCopyInfo.uniformLocations.scale, textureWidth, textureHeight, canvas.width, canvas.height);
    gl.uniform1i(programCopyInfo.uniformLocations.state, 0);
    gl.uniform1i(programCopyInfo.uniformLocations.backgroundTexture, 1);
    gl.uniform1i(programCopyInfo.uniformLocations.traineauTexture, 2);
    let runtimeState = {
        frameCount: 0,
        x: -1,
        y: -1,
        traineauPosition: canvas.width,
    };
    monitorFPS(canvas, runtimeState);
    handleInteractions(canvas, runtimeState);
    const fpsInterval = 1000 / 61.0;
    let expectedFrameDate = Date.now();
    function updateAnimation(timestamp) {
        let now = Date.now();
        if (now >= expectedFrameDate) {
            expectedFrameDate += Math.trunc((now - expectedFrameDate) / fpsInterval + 1) * fpsInterval;
            runtimeState.frameCount++;
            {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, state[currentTextureIndex]);
                if (runtimeState.x != -1 && runtimeState.y != -1) {
                    runtimeState.x = runtimeState.x / window.innerWidth * canvas.width;
                    runtimeState.y = runtimeState.y / window.innerHeight * canvas.height;
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, runtimeState.x, runtimeState.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 128, 0, 0]));
                    runtimeState.x = runtimeState.y = -1;
                }
                currentTextureIndex = currentTextureIndex == 1 ? 0 : 1;
                // Render to texture
                gl.useProgram(programInfo.program);
                // Set the shader uniforms
                gl.uniform2f(programInfo.uniformLocations.random, Math.random(), Math.random());
                gl.uniform1f(programInfo.uniformLocations.time, (now % 1000) / 1000.0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, state[currentTextureIndex], 0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                // Render to screen
                gl.useProgram(programCopyInfo.program);
                gl.uniform1f(programCopyInfo.uniformLocations.time, (now % 2000) * (1.0 / 2000.0));
                gl.uniform2f(programCopyInfo.uniformLocations.traineauPosition, runtimeState.traineauPosition, canvas.height - 100.0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                runtimeState.traineauPosition -= 1;
                if (runtimeState.traineauPosition < -traineau_image.width)
                    runtimeState.traineauPosition = canvas.width * 2;
            }
        }
        window.requestAnimationFrame(updateAnimation);
    }
    window.requestAnimationFrame(updateAnimation);
}))();
//# sourceMappingURL=index.js.map