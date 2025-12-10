import * as shaders from './shaders.js'

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
    const shaderPreprocessEnvironmentProgram = initShaderProgram(gl, shaders.vsSource, shaders.fsPreprocessEnvironmentSource) as WebGLProgram;
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
        if(!(event.buttons & 1)) {
            return;
        }

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

    canvas.addEventListener('mousemove', handleMouseEvent);


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

    while(canvas.width > 512 && canvas.height > 512) {
        canvas.width /= 2.0;
        canvas.height /= 2.0;
    }

    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    const gl: WebGL2RenderingContext = canvas.getContext('webgl2', { alpha: false, antialias: false }) as WebGL2RenderingContext;

    gl.disable(gl.DEPTH_TEST);
    const shaderProgram = initShaderProgram(gl, shaders.vsSource, shaders.fsSource) as WebGLProgram;
    const shaderCopyProgram = initShaderProgram(gl, shaders.vsSource, shaders.fsCopySource) as WebGLProgram;
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
    gl.uniform1i(programCopyInfo.uniformLocations.traineauTexture, 2);


    let runtimeState = {
        frameCount: 0,
        x: -1,
        y: -1,
        traineauPosition: canvas.width,
    }
    monitorFPS(canvas, runtimeState);

    handleInteractions(canvas, runtimeState);
    

    const fpsInterval = 1000 / 61.0;
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
})();
