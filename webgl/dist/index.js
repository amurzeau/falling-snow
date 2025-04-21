var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as glutils from './gl-utils.js';
import * as shaders from './shaders.js';
function monitorFPS(canvas, runtimeState) {
    let fpsElement = document.getElementById('fps');
    setInterval(function () {
        let count = runtimeState.frameCount;
        runtimeState.frameCount = 0;
        fpsElement.textContent = "FPS: " + count + " " + window.devicePixelRatio + " " + canvas.width + " " + canvas.height;
    }, 1000);
}
let fullscreen_asked = false;
function handleInteractions(canvas, runtimeState) {
    let generateSnowByMouseInterval = undefined;
    function handleMouseEvent(event) {
        if (!(event.buttons & 1)) {
            return;
        }
        //if(!fullscreen_asked) {
        //    canvas.requestFullscreen();
        //    fullscreen_asked = true;
        //}
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
        if (event.touches.length == 0)
            return;
        //if(!fullscreen_asked) {
        //    canvas.requestFullscreen();
        //    fullscreen_asked = true;
        //}
        if (runtimeState.x != -1 || runtimeState.y != -1) {
            return;
        }
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
(() => __awaiter(void 0, void 0, void 0, function* () {
    const canvas = document.getElementById('canvas');
    if (!canvas)
        return;
    // Adjust canvas size to an appropriate zoom to avoid too much pixel to be drawn by fragment shader
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    while (canvas.width > 512 && canvas.height > 512) {
        canvas.width /= 2.0;
        canvas.height /= 2.0;
    }
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    let gl = glutils.initOpenGL(canvas);
    const shaderProgram = glutils.initShaderProgram(shaders.vsSource, shaders.fsScreen);
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
            backgroundTexture: gl.getUniformLocation(shaderProgram, "backgroundTexture"),
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
    yield glutils.prepareEnvironment(backgroundTexture, framebuffer);
    let backgroundObject = new glutils.GL2DObject();
    backgroundObject.position = [0.0, 0.0];
    backgroundObject.size = [1.0, 1.0];
    backgroundObject.texture = backgroundTexture;
    let objects = [];
    objects.push(backgroundObject);
    let poissonObject = yield glutils.GL2DObject.createGL2DObject("poisson.png", 0.02, 0.5, 0.05, 0.05);
    objects.push(poissonObject);
    // Clear the canvas before we start drawing on it.
    glutils.prepareViewport(canvas.width, canvas.height);
    // Select active texture index
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(programInfo.program);
    // Set the shader uniforms
    gl.uniform1i(programInfo.uniformLocations.backgroundTexture, 0); // Background texture is in texture slot 0
    let runtimeState = {
        frameCount: 0,
        x: -1,
        y: -1,
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
                //gl.activeTexture(gl.TEXTURE0);
                //gl.bindTexture(gl.TEXTURE_2D, state[currentTextureIndex]);
                //if(runtimeState.x != -1 && runtimeState.y != -1) {
                //    runtimeState.x = runtimeState.x / window.innerWidth * canvas.width;
                //    runtimeState.y = runtimeState.y / window.innerHeight * canvas.height;
                //    gl.texSubImage2D(gl.TEXTURE_2D, 0, runtimeState.x, runtimeState.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 128, 0, 0]));
                //    runtimeState.x = runtimeState.y = -1;
                //}
                //currentTextureIndex = currentTextureIndex == 1 ? 0 : 1;
                // Render objects
                for (let object of objects) {
                    object.bindObject(programInfo.uniformLocations.position);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                }
                poissonObject.position[0] += 0.01;
            }
        }
        window.requestAnimationFrame(updateAnimation);
    }
    window.requestAnimationFrame(updateAnimation);
}))();
//# sourceMappingURL=index.js.map