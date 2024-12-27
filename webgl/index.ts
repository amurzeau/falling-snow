
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

const fsSource = `#version 300 es
#ifdef GL_ES
precision mediump float;
#endif

out vec4 fragColor;
uniform sampler2D state;
uniform sampler2D backgroundTextures[3];
uniform vec4 scale;
uniform vec2 random;

vec4 get_wrapped_falling_snow(vec2 offset) {
    float new_flake = step(scale.w, gl_FragCoord.y + offset.y);

    // Add a randomization to X component when it is a new_flake
    offset.x += new_flake * random.x * scale.x;

    vec2 wrapped_coord = mod((gl_FragCoord.xy + offset), scale.zw);

    return vec4(texture(state, wrapped_coord / scale.xy).xyz, new_flake);
}

vec4 get_snow_bottom(vec2 offset) {
    vec2 wrapped_coord = mod((gl_FragCoord.xy + offset), scale.zw);
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

void main() {
    // Get state above
    // Color contains particule presence
    // Alpha contains if particule touched bottom
    float particle_slow = get_wrapped_falling_snow(vec2(0.0, 1.0)).r;
    float particle_medium = get_wrapped_falling_snow(vec2(0.0, 2.0)).g;
    float particle_fast = get_wrapped_falling_snow(vec2(0.0, 4.0)).b;

    float current_bottom_state = get_snow_bottom(vec2(0.0, 0.0)).a;
    float is_snow_above =
        ceil(
            get_snow_bottom(vec2(0.0, 1.0)).a +
            get_snow_bottom(vec2(-1.0, 1.0)).a +
            get_snow_bottom(vec2(1.0, 1.0)).a
        );
    float is_pixel_not_candidate_for_removing = min(abs(random.y*scale.x - gl_FragCoord.x), 1.0);

    float is_environment_below =
        (1.0 - get_environment(vec2(0.0, 0.0))) *
        get_environment(vec2(0.0, -1.0));

    // After 10 pixel height, snow can't grow anymore
    float snow_height_below = max(is_environment_below, max(get_snow_bottom(vec2(0.0, -1.0)).a - 0.1, current_bottom_state));

    // There is snow below, enough to be stable (avoiding tall snow accumulation at one column)
    float is_bottom_stable =
        is_environment_below +
        ceil(
            snow_height_below *
            get_snow_bottom(vec2(-1.0, -1.0)).a *
            get_snow_bottom(vec2(1.0, -1.0)).a
        );


    // Adjust chance to remove according to height of pixel above bottom to get mostly 10px of snow (50% of chance at 10px of height)
    float snow_removal_chance = 1.0 - current_bottom_state;

    // Don't remove when
    // - there is snow above (is_snow_above)
    // - the current processed pixel is not the random one candidate for removing (is_pixel_not_candidate_for_removing)
    // - snow below is not stable, this happen when at the last line of snow (1.0 - is_bottom_stable)
    // The chance to remove is defined by first argument:
    // - 1.0 => 100% chance of removal (if above conditions fullfilled)
    // - 0.0 => 0% chance of removal
    float remove_instead = step(snow_removal_chance, random.x + is_snow_above + is_pixel_not_candidate_for_removing + (1.0 - is_bottom_stable));

    
    // Snow dropped on floor when there was a snow flake at our position or at above position.
    // Snow that drop on floor move at 2 pixels at once.
    float is_snow_flake_dropped =
        get_snow_bottom(vec2(0.0, 1.0)).g + get_snow_bottom(vec2(0.0, 0.0)).g;

    fragColor = vec4(particle_slow,
        particle_medium,
        particle_fast,
        min(
            (ceil(current_bottom_state) + is_bottom_stable * is_snow_flake_dropped) * remove_instead,
            1.0
        ) * snow_height_below
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

vec4 get(vec2 offset) {
    return texture(state, (gl_FragCoord.xy + offset) / scale.xy);
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

    vec4 snow1 = vec4((snow_value1));
    vec4 snow2 = vec4((snow_value2));

    vec4 texture1 = get_background(backgroundTextures[0], vec2(-10.0, 0.0));
    vec4 texture2 = get_background(backgroundTextures[1], vec2(-120.0, 0.0));

    vec3 blendedColor = snow1.rgb;
    blendedColor = mix(blendedColor, texture1.rgb, texture1.a);
    blendedColor = mix(blendedColor, texture2.rgb, texture2.a);
    blendedColor = mix(blendedColor, snow2.rgb, snow2.a);

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

(async () => {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas)
        return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

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
    let rand = new Uint8Array(canvas.width * (canvas.height+1) * 4);
    const flake_sizes = [6, 2, 1];
    const particle_count = canvas.width*canvas.height/2000;
    for(let i = 0; i < rand.length; i += 4) {
        rand[i + 0] = Math.random() < 0.0006 ? 255 : 0;
        rand[i + 1] = Math.random() < 0.0002 ? 255 : 0;
        rand[i + 2] = Math.random() < 0.0001 ? 255 : 0;

        let column = Math.trunc(i/4/canvas.width);
        if(column == 0 || column == canvas.height)
            rand[i + 3] = 255;
        else
            rand[i + 3] = 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, state[currentTextureIndex]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, canvas.width, canvas.height+1, gl.RGBA, gl.UNSIGNED_BYTE, rand);

    const backgroundTexture = texture(gl, textureWidth, textureHeight);

    let maison_image: HTMLImageElement = await getImageData("maison.png");
    let sapin_image: HTMLImageElement = await getImageData("sapin.png");
    let traineau_image: HTMLImageElement = await getImageData("traineau.png");

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

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.enableVertexAttribArray(programInfo.attribLocations.quad);
    gl.vertexAttribPointer(
        programInfo.attribLocations.quad,
        2,
        gl.FLOAT,
        false,
        0,
        0,
    );
    gl.viewport(0, 0, canvas.width, canvas.height);

    let frameCount = 0;
    let fpsElement: HTMLDivElement = document.getElementById('fps') as HTMLDivElement;
    setInterval(function () {
        let count = frameCount;
        frameCount = 0;
        fpsElement.textContent = "FPS: " + count + " " + window.devicePixelRatio + " " + canvas.width + " " + canvas.height;
    }, 1000);


    const fpsInterval = 1000 / 60.0;
    let expectedFrameDate = Date.now();

    function updateAnimation(timestamp: DOMHighResTimeStamp) {
        let now = Date.now();
        if (1) {
            expectedFrameDate += Math.trunc((now - expectedFrameDate) / fpsInterval + 1) * fpsInterval;

            frameCount++;
            {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, state[currentTextureIndex]);
                currentTextureIndex = currentTextureIndex == 1 ? 0 : 1;

                // Render to texture
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
                gl.uniform2f(
                    programInfo.uniformLocations.random,
                    Math.random(),
                    Math.random(),
                );
                gl.uniform1i(programInfo.uniformLocations.state, 0);
                gl.uniform1iv(programInfo.uniformLocations.backgroundTextures, [1, 2, 3]);
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, state[currentTextureIndex], 0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                // Render to screen
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
                gl.uniform1iv(programCopyInfo.uniformLocations.backgroundTextures, [1, 2, 3]);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        }

        window.requestAnimationFrame(updateAnimation);
    }
    window.requestAnimationFrame(updateAnimation);
})();
