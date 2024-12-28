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
const fsSource = `#version 300 es
#ifdef GL_ES
precision mediump float;
#endif

out vec4 fragColor;
uniform sampler2D state;
uniform sampler2D backgroundTextures[3];
uniform vec4 scale;
uniform vec2 random;

const vec3 bitEnc = vec3(1.,255.,65025.) / 2.0;
const vec3 bitDec = 1./bitEnc;
vec3 EncodeFloatRGB (float v) {
    vec3 enc = bitEnc * v;
    enc = fract(enc);
    enc -= enc.yzz * vec2(1./255., 0.).xxy;
    return enc;
}
float DecodeFloatRGB (vec3 v) {
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
    vec2 wrapped_coord = clamp((gl_FragCoord.xy + offset), vec2(0.0), scale.zw);
    return texture(state, (wrapped_coord / scale.xy));
}

vec4 get_background(sampler2D sampler, vec2 offset) {
    return texelFetch(sampler, ivec2(gl_FragCoord.xy + offset), 0);
}

float get_environment(vec2 offset) {
    vec4 texture1 = get_background(backgroundTextures[0], vec2(-10.0, 0.0) + offset);
    vec4 texture2 = get_background(backgroundTextures[1], vec2(-120.0, 0.0) + offset);

    return mix(texture1.a, texture2.a, texture2.a);
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
    return DecodeFloatRGB(get_snow_bottom(vec2(x, y)).gba);
}

bool is_snow_arround(float x, float y) {
    return
        DecodeFloatRGB(get_snow_bottom(vec2(x, y)).gba) > 0.0;
}

bool is_snow_or_env_arround(float x, float y) {
    return
        DecodeFloatRGB(get_snow_bottom(vec2(x, y)).gba) > 0.0 ||
        get_environment(vec2(x, y)) > 0.0;
}

vec3 encode_snow_particules(float snow_particule_age) {
    return EncodeFloatRGB(snow_particule_age);
}

bool get_snow_flake_dropped() {
    int snow_present =
        int(get_snow_bottom(vec2(0.0, 1.0)).r * 255.0) |
        int(get_snow_bottom(vec2(0.0, 0.0)).r * 255.0);

    return (snow_present & 0x2) != 0 && (snow_present & 0x4) != 0;
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

    fragColor = vec4(
        get_falling_snow_state(),
        encode_snow_particules(particule_is_present ? particule_age : 0.0)
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
uniform sampler2D backgroundTextures[3];
uniform vec4 scale;

const float snow_flake_small[25] = float[25](
    0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0
);

const float snow_flake_medium[25] = float[25](
    0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 1.0, 0.0,
    0.0, 0.0, 1.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0,
    0.0, 0.0, 0.0, 0.0, 0.0
);

const float snow_flake_large[25] = float[25](
    1.0, 0.0, 1.0, 0.0, 1.0,
    0.0, 1.0, 1.0, 1.0, 0.0,
    1.0, 1.0, 1.0, 1.0, 1.0,
    0.0, 1.0, 1.0, 1.0, 0.0,
    1.0, 0.0, 1.0, 0.0, 1.0
);


const vec3 bitEnc = vec3(1.,255.,65025.) / 2.0;
const vec3 bitDec = 1./bitEnc;
vec3 EncodeFloatRGB (float v) {
    vec3 enc = bitEnc * v;
    enc = fract(enc);
    enc -= enc.yzz * vec2(1./255., 0.).xxy;
    return enc;
}
float DecodeFloatRGB (vec3 v) {
    return dot(v, bitDec);
}

vec4 get(vec2 offset) {
    vec4 texel = texture(state, (gl_FragCoord.xy + offset) / scale.xy);
    int snow_flakes = int(texel.r * 255.0);
    float particule_age = DecodeFloatRGB(texel.gba) > 0.0 ? mix(0.5, 1.0, DecodeFloatRGB(texel.gba)) : 0.0;

    texel.r = (snow_flakes & 0x01) != 0 ? 1.0 : 0.0;
    texel.g = (snow_flakes & 0x02) != 0 ? 1.0 : 0.0;
    texel.b = (snow_flakes & 0x08) != 0 ? 1.0 : 0.0;
    texel.a = particule_age;

    return texel;
}

vec4 get_background(sampler2D sampler, vec2 offset) {
    return texelFetch(sampler, ivec2(gl_FragCoord.xy + offset), 0);
}

vec4 in_snow_flake() {
    float snow_value1 = 0.0;
    float snow_value2 = 0.0;
    float x;
    float y;

    for(x = 2.0; x < 4.0; x++) {
        for(y = 1.0; y < 3.0; y++) {
            vec4 snow_state = get(vec2(x - 2.0, y - 2.0));
            int offset = int(y * 5.0 + x);
            
            snow_value1 = min(
                snow_value1 +
                snow_state.r * snow_flake_small[offset] +
                snow_state.g * snow_flake_medium[offset],
                1.0);
        }
    }

    for(x = 0.0; x < 5.0; x++) {
        for(y = 0.0; y < 5.0; y++) {
            vec4 snow_state = get(vec2(x - 2.0, y - 2.0));
            int offset = int(y * 5.0 + x);
            
            snow_value2 = min(
                snow_value2 +
                snow_state.a * snow_flake_small[offset] +
                snow_state.b * snow_flake_large[offset],
                1.0);
        }
    }

    vec4 snow1 = vec4(snow_value1);
    vec4 snow2 = vec4(snow_value2);

    vec4 texture1 = get_background(backgroundTextures[0], vec2(-10.0, 0.0));
    vec4 texture2 = get_background(backgroundTextures[1], vec2(-120.0, 0.0));

    vec3 blendedColor = snow1.rgb;
    blendedColor = mix(blendedColor, texture1.rgb, texture1.a);
    blendedColor = mix(blendedColor, texture2.rgb, texture2.a);
    blendedColor = snow2.a > 0.0 ? snow2.rgb : blendedColor;

    return vec4(blendedColor, 1.0);
}

void main() {
    fragColor = in_snow_flake();
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
(() => __awaiter(this, void 0, void 0, function* () {
    const canvas = document.getElementById('canvas');
    if (!canvas)
        return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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
            backgroundTextures: gl.getUniformLocation(shaderProgram, "backgroundTextures"),
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
            backgroundTextures: gl.getUniformLocation(shaderCopyProgram, "backgroundTextures"),
        },
    };
    const positionBuffer = initPositionBuffer(gl);
    const textureWidth = nearestPowerOf2(canvas.width);
    const textureHeight = nearestPowerOf2(canvas.height);
    // Double buffering texture, one for the previous state, one for the next state
    // RGB contains the 3 layers snow
    const state = [
        texture(gl, textureWidth, textureHeight),
        texture(gl, textureWidth, textureHeight)
    ];
    let currentTextureIndex = 0;
    // Initialize snow, each white dot is a snow drawn by the fragment shader
    let rand = new Uint8Array(canvas.width * (canvas.height + 1) * 4);
    const flake_sizes = [6, 2, 1];
    const particle_count = canvas.width * canvas.height / 2000;
    for (let i = 0; i < rand.length; i += 4) {
        rand[i + 0] =
            ((Math.random() < 0.0006 ? 1 : 0) << 0) |
                ((Math.random() < 0.0002 ? 3 : 0) << 1) |
                ((Math.random() < 0.0001 ? 1 : 0) << 3);
        rand[i + 1] = 0;
        rand[i + 2] = 0;
        rand[i + 3] = 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, state[currentTextureIndex]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, canvas.width, canvas.height + 1, gl.RGBA, gl.UNSIGNED_BYTE, rand);
    const backgroundTexture = texture(gl, textureWidth, textureHeight);
    let maison_image = yield getImageData("maison.png");
    let sapin_image = yield getImageData("sapin.png");
    let traineau_image = yield getImageData("traineau.png");
    gl.activeTexture(gl.TEXTURE0 + 1);
    const maisonTexture = textureFromImage(gl, maison_image);
    gl.activeTexture(gl.TEXTURE0 + 2);
    const sapinTexture = textureFromImage(gl, sapin_image);
    gl.activeTexture(gl.TEXTURE0 + 3);
    const traineauTexture = textureFromImage(gl, traineau_image);
    const framebuffer = gl.createFramebuffer();
    // Clear the canvas before we start drawing on it.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(programInfo.attribLocations.quad);
    gl.vertexAttribPointer(programInfo.attribLocations.quad, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    let frameCount = 0;
    let fpsElement = document.getElementById('fps');
    setInterval(function () {
        let count = frameCount;
        frameCount = 0;
        fpsElement.textContent = "FPS: " + count + " " + window.devicePixelRatio + " " + canvas.width + " " + canvas.height;
    }, 1000);
    const fpsInterval = 1000 / 60.0;
    let expectedFrameDate = Date.now();
    function updateAnimation(timestamp) {
        let now = Date.now();
        if (now >= expectedFrameDate) {
            expectedFrameDate += Math.trunc((now - expectedFrameDate) / fpsInterval + 1) * fpsInterval;
            frameCount++;
            {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, state[currentTextureIndex]);
                currentTextureIndex = currentTextureIndex == 1 ? 0 : 1;
                // Render to texture
                gl.useProgram(programInfo.program);
                // Set the shader uniforms
                gl.uniform4f(programInfo.uniformLocations.scale, textureWidth, textureHeight, canvas.width, canvas.height);
                gl.uniform1i(programInfo.uniformLocations.state, 0);
                gl.uniform2f(programInfo.uniformLocations.random, Math.random(), Math.random());
                gl.uniform1i(programInfo.uniformLocations.state, 0);
                gl.uniform1iv(programInfo.uniformLocations.backgroundTextures, [1, 2, 3]);
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, state[currentTextureIndex], 0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                // Render to screen
                gl.useProgram(programCopyInfo.program);
                // Set the shader uniforms
                gl.uniform4f(programCopyInfo.uniformLocations.scale, textureWidth, textureHeight, canvas.width, canvas.height);
                gl.uniform1i(programCopyInfo.uniformLocations.state, 0);
                gl.uniform1iv(programCopyInfo.uniformLocations.backgroundTextures, [1, 2, 3]);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        }
        window.requestAnimationFrame(updateAnimation);
    }
    window.requestAnimationFrame(updateAnimation);
}))();
//# sourceMappingURL=index.js.map