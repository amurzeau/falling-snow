// <reference path='./sensors.d.ts'/>
import * as glutils from './gl-utils.js'
import * as shaders from './shaders.js'

function monitorFPS(canvas: HTMLCanvasElement, runtimeState, snow_count) {
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

window.onload = function() {
    setTimeout(
    async () => {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        if (!canvas)
            return;

        // Adjust canvas size to an appropriate zoom to avoid too much pixel to be drawn by fragment shader
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        let ratio_w = canvas.width / 400.0;
        let ratio_h = canvas.height / 200.0;

        if(ratio_h > ratio_w) {
            canvas.width /= ratio_w;
            canvas.height /= ratio_w;
        } else {
            canvas.width /= ratio_h;
            canvas.height /= ratio_h;
        }

        canvas.style.width = "100%";
        canvas.style.height = "100%";

        let gl = glutils.initOpenGL(canvas);

        const shaderProgram = glutils.initShaderProgram(shaders.vsSource, shaders.fsSource) as WebGLProgram;
        const shaderCopyProgram = glutils.initShaderProgram(shaders.vsSource, shaders.fsCopySource) as WebGLProgram;
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
                position: gl.getUniformLocation(shaderCopyProgram, "position"),
                scale: gl.getUniformLocation(shaderCopyProgram, "scale"),
                state: gl.getUniformLocation(shaderCopyProgram, "state"),
                time: gl.getUniformLocation(shaderCopyProgram, "time"),
                backgroundTexture: gl.getUniformLocation(shaderCopyProgram, "backgroundTexture"),
                traineauTexture: gl.getUniformLocation(shaderCopyProgram, "traineauTexture"),
                traineauPosition: gl.getUniformLocation(shaderCopyProgram, "traineauPosition"),
                backgroundTreesTexture: gl.getUniformLocation(shaderCopyProgram, "backgroundTreesTexture"),
                maisonTexture: gl.getUniformLocation(shaderCopyProgram, "maisonTexture"),
                sapinTexture: gl.getUniformLocation(shaderCopyProgram, "sapinTexture"),
            },
        };

        const framebuffer = gl.createFramebuffer();

        const textureWidth = glutils.nearestPowerOf2(canvas.width);
        const textureHeight = glutils.nearestPowerOf2(canvas.height);

        glutils.prepareVertices(programInfo.attribLocations.quad);
        // Clear the canvas before we start drawing on it.
        glutils.prepareViewport(canvas.width, canvas.height);

        // Double buffering texture, one for the previous state, one for the next state
        // RGB contains the 3 layers snow
        const state = [
            glutils.texture(textureWidth, textureHeight),
            glutils.texture(textureWidth, textureHeight)
        ];
        let currentTextureIndex = 0;

        // Initialize snow, each white dot is a snow drawn by the fragment shader
        let snow_count = glutils.initializeSnowState(state[currentTextureIndex]);

        const backgroundTexture = glutils.texture(textureWidth, textureHeight);
        await glutils.prepareEnvironment(backgroundTexture, framebuffer);

        // Prepare textures for drawing main loop
        let traineau_image: HTMLImageElement = await glutils.getImageData("traineau.png");
        let background_trees_image: HTMLImageElement = await glutils.getImageData("background_trees.png");
        let maison_image: HTMLImageElement = await glutils.getImageData("maison.png");
        let sapin_image: HTMLImageElement = await glutils.getImageData("sapin.png");

        gl.activeTexture(gl.TEXTURE0 + 1);
        gl.bindTexture(gl.TEXTURE_2D, backgroundTexture);

        gl.activeTexture(gl.TEXTURE0 + 2);
        glutils.textureFromImage(traineau_image);

        gl.activeTexture(gl.TEXTURE0 + 3);
        glutils.textureFromImage(background_trees_image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.activeTexture(gl.TEXTURE0 + 4);
        glutils.textureFromImage(maison_image);

        gl.activeTexture(gl.TEXTURE0 + 5);
        glutils.textureFromImage(sapin_image);

        gl.activeTexture(gl.TEXTURE0);


        gl.useProgram(programInfo.program);
        // Set the shader uniforms
        gl.uniform4f(programInfo.uniformLocations.position, 0, 0, 1, 1);
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
        gl.uniform4f(programCopyInfo.uniformLocations.position, 0, 0, 1, 1);
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
        gl.uniform1i(programCopyInfo.uniformLocations.backgroundTreesTexture, 3);
        gl.uniform1i(programCopyInfo.uniformLocations.maisonTexture, 4);
        gl.uniform1i(programCopyInfo.uniformLocations.sapinTexture, 5);


        let runtimeState = {
            frameCount: 0,
            x: -1,
            y: -1,
            traineauPosition: canvas.width,
        }
        monitorFPS(canvas, runtimeState, snow_count);

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

                    gl.disable(gl.BLEND);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                    // Render to screen
                    gl.useProgram(programCopyInfo.program);
                    gl.uniform1f(programCopyInfo.uniformLocations.time, (now % 10000) / 10000.0);
                    gl.uniform2f(programCopyInfo.uniformLocations.traineauPosition, runtimeState.traineauPosition, canvas.height - 100.0);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    gl.enable(gl.BLEND);
                    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                    runtimeState.traineauPosition -= 1;
                    if (runtimeState.traineauPosition < -traineau_image.width)
                        runtimeState.traineauPosition = canvas.width * 2;
                }
            }

            window.requestAnimationFrame(updateAnimation);
        }
        window.requestAnimationFrame(updateAnimation);
    },
    500);
}