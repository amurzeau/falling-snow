
function addImageProcess(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        let img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.crossOrigin = "anonymous";
        img.src = src
    })
}

async function getImageData(image: string): Promise<HTMLImageElement> {
    var canvas = document.createElement('canvas');
    var ctx: CanvasRenderingContext2D = canvas.getContext('2d') as CanvasRenderingContext2D;

    // 2) Copy your image data into the canvas
    return addImageProcess(image);
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
        encode_snow_particules(particule_is_present ? particule_age : 0.0),
        0.0
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

vec4 in_snow_flake() {
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

    snow_value = ceil(min(snow_value, vec2(1.0)));

    vec4 texture = texture(backgroundTexture, gl_FragCoord.xy / scale.xy);

    vec3 blendedColor = snow_value.xxx;
    blendedColor = mix(blendedColor, texture.rgb, texture.a);
    blendedColor = mix(blendedColor, snow_value.yyy, snow_value.y);

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
function loadShader(gl: WebGL2RenderingContext, type: any, source: any) {
    const shader = gl.createShader(type) as WebGLShader;

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

function initShaderProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource) as WebGLShader;
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource) as WebGLShader;

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

function initPositionBuffer(gl: WebGL2RenderingContext) {
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

function texture(gl: WebGL2RenderingContext, width, height) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
        width, height,
        0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    return tex;
};

function textureFromImage(gl: WebGL2RenderingContext, image: HTMLImageElement) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    return tex;
};

function prepareVertices(gl: WebGL2RenderingContext, quad_uniform: number) {
    const positionBuffer = initPositionBuffer(gl);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.enableVertexAttribArray(quad_uniform);
    gl.vertexAttribPointer(
        quad_uniform,
        2,
        gl.FLOAT,
        false,
        0,
        0,
    );
}

function prepareViewport(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, canvas.width, canvas.height);
}

let snow_count = 0;
function initializeSnowState(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement, state: WebGLTexture) {
    let rand = new Uint8Array(canvas.width * (canvas.height+1) * 4);
    for(let i = 0; i < rand.length; i += 4) {
        rand[i + 0] =
            ((Math.random() < 0.0006 ? 1 : 0) << 0) |
            ((Math.random() < 0.00015 ? 3 : 0) << 1) |
            ((Math.random() < 0.0001 ? 1 : 0) << 3);

        if(rand[i + 0] & 0x6) {
            snow_count++;
        }

        rand[i + 1] = 0;
        rand[i + 2] = 0;
        rand[i + 3] = 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, state);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, canvas.width, canvas.height+1, gl.RGBA, gl.UNSIGNED_BYTE, rand);
}

async function prepareEnvironment(gl: WebGL2RenderingContext, backgroundTexture: WebGLTexture | null, framebuffer: WebGLFramebuffer | null) {
    const shaderPreprocessEnvironmentProgram = initShaderProgram(gl, vsSource, fsPreprocessEnvironmentSource) as WebGLProgram;
    const programProcessEnvironmentInfo = {
        program: shaderPreprocessEnvironmentProgram,
        attribLocations: {
            quad: gl.getAttribLocation(shaderPreprocessEnvironmentProgram, "in_quad"),
        },
        uniformLocations: {
            backgroundTextures: gl.getUniformLocation(shaderPreprocessEnvironmentProgram, "backgroundTextures"),
        },
    };

    let maison_image: HTMLImageElement = await getImageData("maison.png");
    let sapin_image: HTMLImageElement = await getImageData("sapin.png");

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
}

function monitorFPS(canvas: HTMLCanvasElement, runtimeState) {
    let fpsElement: HTMLDivElement = document.getElementById('fps') as HTMLDivElement;
    setInterval(function () {
        let count = runtimeState.frameCount;
        runtimeState.frameCount = 0;
        fpsElement.textContent = "FPS: " + count + " " + window.devicePixelRatio + " " + canvas.width + " " + canvas.height + " " +
            (canvas.width * canvas.height / snow_count);
    }, 1000);
}

function handleInteractions(canvas: HTMLCanvasElement, runtimeState) {
    let generateSnowByMouseInterval: number | undefined = undefined;

    function handleMouseEvent(event) {
        if(runtimeState.x != -1 || runtimeState.y != -1) {
            return;
        }

        const rect = canvas.getBoundingClientRect();
        const localX = event.clientX - rect.left;
        const localY = window.innerHeight - (event.clientY - rect.top);
        runtimeState.x = localX;
        runtimeState.y = localY;

        if(generateSnowByMouseInterval !== undefined) {
            clearInterval(generateSnowByMouseInterval);
        }
        generateSnowByMouseInterval = setInterval(function() {
            runtimeState.x = localX;
            runtimeState.y = localY;
        }, 50);
    }
    
    canvas.addEventListener('mousedown', handleMouseEvent);

    canvas.addEventListener('mouseup', function(e) {
        if(generateSnowByMouseInterval !== undefined) {
            clearInterval(generateSnowByMouseInterval);
        }
    });

    canvas.addEventListener('mousemove', function(event) {
        if(event.buttons & 1) {
            handleMouseEvent(event);
        }
    });


    function handleTouchEvent(event) {
        if(runtimeState.x != -1 || runtimeState.y != -1) {
            return;
        }

        if(event.touches.length == 0)
            return;

        const touchEvent = event.touches[0];

        const rect = canvas.getBoundingClientRect();
        const localX = touchEvent.clientX - rect.left;
        const localY = window.innerHeight - (touchEvent.clientY - rect.top);
        runtimeState.x = localX;
        runtimeState.y = localY;

        if(generateSnowByMouseInterval !== undefined) {
            clearInterval(generateSnowByMouseInterval);
        }
        generateSnowByMouseInterval = setInterval(function() {
            runtimeState.x = localX;
            runtimeState.y = localY;
        }, 50);
        event.preventDefault();
        event.stopPropagation();
    }

    canvas.addEventListener("touchstart", handleTouchEvent);
    canvas.addEventListener("touchmove", function(event) {
        handleTouchEvent(event);
    });
    canvas.addEventListener("touchend", function(event) {
        if(generateSnowByMouseInterval !== undefined) {
            clearInterval(generateSnowByMouseInterval);
        }
    });
    canvas.addEventListener("touchcancel", function(event) {
        if(generateSnowByMouseInterval !== undefined) {
            clearInterval(generateSnowByMouseInterval);
        }
    });
}

(async () => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas)
        return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    while(canvas.width > 1024 && canvas.height > 512) {
        canvas.width /= 2.0;
        canvas.height /= 2.0;
    }

    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    const gl: WebGL2RenderingContext = canvas.getContext('webgl2', { alpha: false, antialias: false }) as WebGL2RenderingContext;

    gl.disable(gl.DEPTH_TEST);
    const shaderProgram = initShaderProgram(gl, vsSource, fsSource) as WebGLProgram;
    const shaderCopyProgram = initShaderProgram(gl, vsSource, fsCopySource) as WebGLProgram;
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
            backgroundTexture: gl.getUniformLocation(shaderCopyProgram, "backgroundTexture"),
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
    await prepareEnvironment(gl, backgroundTexture, framebuffer);

    // Prepare textures for drawing main loop
    let traineau_image: HTMLImageElement = await getImageData("traineau.png");

    gl.activeTexture(gl.TEXTURE0 + 1);
    gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);
    gl.activeTexture(gl.TEXTURE0 + 2);
    textureFromImage(gl, traineau_image);

    gl.activeTexture(gl.TEXTURE0);


    gl.useProgram(programInfo.program);
    // Set the shader uniforms
    gl.uniform4f(
        programInfo.uniformLocations.scale,
        textureWidth,
        textureHeight,
        canvas.width,
        canvas.height,
    );
    gl.uniform1i(
        programInfo.uniformLocations.state,
        0,
    );
    gl.uniform1i(programInfo.uniformLocations.state, 0);
    gl.uniform1i(programInfo.uniformLocations.backgroundTexture, 1);


    gl.useProgram(programCopyInfo.program);
    // Set the shader uniforms
    gl.uniform4f(
        programCopyInfo.uniformLocations.scale,
        textureWidth,
        textureHeight,
        canvas.width,
        canvas.height,
    );
    gl.uniform1i(programCopyInfo.uniformLocations.state, 0);
    gl.uniform1i(programCopyInfo.uniformLocations.backgroundTexture, 1);


    let runtimeState = {
        frameCount: 0,
        x: -1,
        y: -1,
    }
    monitorFPS(canvas, runtimeState);

    handleInteractions(canvas, runtimeState);
    

    const fpsInterval = 1000 / 60.0;
    let expectedFrameDate = Date.now();

    function updateAnimation(timestamp: DOMHighResTimeStamp) {
        let now = Date.now();
        if (now >= expectedFrameDate) {
            expectedFrameDate += Math.trunc((now - expectedFrameDate) / fpsInterval + 1) * fpsInterval;

            runtimeState.frameCount++;
            {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, state[currentTextureIndex]);
                if(runtimeState.x != -1 && runtimeState.y != -1) {
                    runtimeState.x = runtimeState.x / window.innerWidth * canvas.width;
                    runtimeState.y = runtimeState.y / window.innerHeight * canvas.height;
                    gl.texSubImage2D(gl.TEXTURE_2D, 0, runtimeState.x, runtimeState.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 128, 0, 0]));
                    runtimeState.x = runtimeState.y = -1;
                }
                currentTextureIndex = currentTextureIndex == 1 ? 0 : 1;

                // Render to texture
                gl.useProgram(programInfo.program);
                // Set the shader uniforms
                gl.uniform2f(
                    programInfo.uniformLocations.random,
                    Math.random(),
                    Math.random(),
                );
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, state[currentTextureIndex], 0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                // Render to screen
                gl.useProgram(programCopyInfo.program);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        }

        window.requestAnimationFrame(updateAnimation);
    }
    window.requestAnimationFrame(updateAnimation);
})();
