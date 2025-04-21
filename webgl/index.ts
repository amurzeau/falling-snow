/// <reference path='gl-matrix/types.d.ts'/>
import * as vec2 from './gl-matrix/vec2'

import * as glutils from './gl-utils.js'
import * as shaders from './shaders.js'

function monitorFPS(canvas: HTMLCanvasElement, runtimeState) {
    let fpsElement: HTMLDivElement = document.getElementById('fps') as HTMLDivElement;

    setInterval(function () {
        let count = runtimeState.frameCount;
        runtimeState.frameCount = 0;
        fpsElement.textContent = "FPS: " + count + " " + window.devicePixelRatio + " " + canvas.width + " " + canvas.height;
    }, 1000);
}

let fullscreen_asked = false;
function handleInteractions(canvas: HTMLCanvasElement, runtimeState) {
    let generateSnowByMouseInterval: number | undefined = undefined;

    function handleMouseEvent(event) {
        if(!(event.buttons & 1)) {
            return;
        }
        //if(!fullscreen_asked) {
        //    canvas.requestFullscreen();
        //    fullscreen_asked = true;
        //}

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

        if(event.touches.length == 0)
            return;

        //if(!fullscreen_asked) {
        //    canvas.requestFullscreen();
        //    fullscreen_asked = true;
        //}

        if(runtimeState.x != -1 || runtimeState.y != -1) {
            return;
        }

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

    // Adjust canvas size to an appropriate zoom to avoid too much pixel to be drawn by fragment shader
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    while(canvas.width > 512 && canvas.height > 512) {
        canvas.width /= 2.0;
        canvas.height /= 2.0;
    }

    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";

    glutils.initOpenGL(canvas);

    const gl: WebGLRenderingContext = canvas.getContext('webgl', { alpha: false, antialias: false }) as WebGLRenderingContext;

    gl.disable(gl.DEPTH_TEST);
    const shaderProgram = glutils.initShaderProgram(shaders.vsSource, shaders.fsScreen) as WebGLProgram;
    const shaderCopyProgram = glutils.initShaderProgram(shaders.vsSource, shaders.fsScreen) as WebGLProgram;
    // Collect all the info needed to use the shader program.
    // Look up which attribute our shader program is using
    // for aVertexPosition and look up uniform locations.

    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            quad: gl.getAttribLocation(shaderProgram, "in_quad"),
        },
        uniformLocations: {
            position: gl.getUniformLocation(shaderProgram, "position"),
            scale: gl.getUniformLocation(shaderProgram, "scale"),
            backgroundTexture: gl.getUniformLocation(shaderProgram, "backgroundTexture"),
        },
    };
    const programCopyInfo = {
        program: shaderCopyProgram,
        attribLocations: {
            quad: gl.getAttribLocation(shaderCopyProgram, "in_quad"),
        },
        uniformLocations: {
            position: gl.getUniformLocation(shaderCopyProgram, "position"),
            scale: gl.getUniformLocation(shaderCopyProgram, "scale"),
            backgroundTexture: gl.getUniformLocation(shaderCopyProgram, "backgroundTexture"),
        },
    };

    const framebuffer = gl.createFramebuffer();

    const textureWidth = glutils.nearestPowerOf2(canvas.width);
    const textureHeight = glutils.nearestPowerOf2(canvas.height);

    glutils.prepareVertices(programInfo.attribLocations.quad);

    // Double buffering texture, one for the previous state, one for the next state
    // RGB contains the 3 layers snow
    const state = [
        glutils.texture(textureWidth, textureHeight),
        glutils.texture(textureWidth, textureHeight)
    ];
    let currentTextureIndex = 0;

    // Initialize snow, each white dot is a snow drawn by the fragment shader
    glutils.initializeSnowState(state[currentTextureIndex]);


    // Draw a pre-rendered background to a texture of the same canvas size
    const backgroundTexture = glutils.texture(canvas.width, canvas.height);
    // Prepare viewport for render to backgroundTexture texture
    glutils.prepareViewport(canvas.width, canvas.height);
    await glutils.prepareEnvironment(backgroundTexture, framebuffer);


    // Clear the canvas before we start drawing on it.
    glutils.prepareViewport(canvas.width, canvas.height);

    // Select active texture index
    gl.activeTexture(gl.TEXTURE0);
    // Bind texture to active texture slot 0
    gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);


    gl.useProgram(programInfo.program);
    // Set the shader uniforms
    gl.uniform4f(programInfo.uniformLocations.position, 0, 1, 0, 1);
    gl.uniform4f(
        programInfo.uniformLocations.scale,
        textureWidth,
        textureHeight,
        canvas.width,
        canvas.height,
    );
    //gl.uniform1i(
    //    programInfo.uniformLocations.state,
    //    0,
    //);
    //gl.uniform1i(programInfo.uniformLocations.state, 0);
    gl.uniform1i(programInfo.uniformLocations.backgroundTexture, 0); // Background texture is in texture slot 0


    gl.useProgram(programCopyInfo.program);
    // Set the shader uniforms
    gl.uniform4f(programCopyInfo.uniformLocations.position, 0, 1, 0, 1);
    gl.uniform4f(
        programCopyInfo.uniformLocations.scale,
        textureWidth,
        textureHeight,
        canvas.width,
        canvas.height,
    );
    //gl.uniform1i(programCopyInfo.uniformLocations.state, 0);
    //gl.uniform1i(programCopyInfo.uniformLocations.traineauTexture, 2);
    gl.uniform1i(programCopyInfo.uniformLocations.backgroundTexture, 0);


    let runtimeState = {
        frameCount: 0,
        x: -1,
        y: -1,
    };
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
                //gl.activeTexture(gl.TEXTURE0);
                //gl.bindTexture(gl.TEXTURE_2D, state[currentTextureIndex]);
                //if(runtimeState.x != -1 && runtimeState.y != -1) {
                //    runtimeState.x = runtimeState.x / window.innerWidth * canvas.width;
                //    runtimeState.y = runtimeState.y / window.innerHeight * canvas.height;
                //    gl.texSubImage2D(gl.TEXTURE_2D, 0, runtimeState.x, runtimeState.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 128, 0, 0]));
                //    runtimeState.x = runtimeState.y = -1;
                //}
                //currentTextureIndex = currentTextureIndex == 1 ? 0 : 1;

                // Render to texture
                gl.useProgram(programInfo.program);
                // Set the shader uniforms
                //gl.uniform2f(
                //    programInfo.uniformLocations.random,
                //    Math.random(),
                //    Math.random(),
                //);
                //gl.uniform1f(programInfo.uniformLocations.time, (now % 1000) / 1000.0);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                //gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, state[currentTextureIndex], 0);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                // Render to screen
                //gl.useProgram(programCopyInfo.program);
                //gl.uniform1f(programCopyInfo.uniformLocations.time, (now % 2000) * (1.0 / 2000.0));
                //gl.uniform2f(programCopyInfo.uniformLocations.traineauPosition, runtimeState.traineauPosition, canvas.height - 100.0);
                //gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                //gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        }

        window.requestAnimationFrame(updateAnimation);
    }
    window.requestAnimationFrame(updateAnimation);
})();
