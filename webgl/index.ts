// <reference path='./sensors.d.ts'/>
import * as glutils from './gl-utils.js'
import * as shaders from './shaders.js'

function monitorFPS(canvas: HTMLCanvasElement, runtimeState) {
    let fpsElement: HTMLDivElement = document.getElementById('fps') as HTMLDivElement;

    setInterval(function () {
        let count = runtimeState.frameCount;
        runtimeState.frameCount = 0;
        fpsElement.textContent = "FPS: " + count + " " + window.devicePixelRatio + " " + canvas.width + " " + canvas.height + " " + runtimeState.bullesObjects.positions.length;
    }, 1000);
}


function handleGravity(runtimeState) {
    if (! ('GravitySensor' in window)) {
        console.log("No gravity sensor");
        return;
    }

    let gravitySensor = new GravitySensor({ frequency: 10 });

    gravitySensor.onerror = (event) => {
        // Handle runtime errors.
        if (event.error.name === 'NotAllowedError') {
            console.log('Permission to access sensor was denied.');
        } else if (event.error.name === 'NotReadableError') {
            console.log('Cannot connect to the sensor.');
        }
    };
    gravitySensor.onreading = (e) => {
        runtimeState.gravity = [(-gravitySensor.y) / 9.81, (gravitySensor.x + gravitySensor.z) / 9.81];
    };
    gravitySensor.start();
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

        if(event.touches.length == 0)
            return;

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

    let gl = glutils.initOpenGL(canvas);

    const shaderProgram = glutils.initShaderProgram(shaders.vsSource, shaders.fsScreen) as WebGLProgram;
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
    await glutils.prepareEnvironment(backgroundTexture, framebuffer);

    let backgroundObject = new glutils.GL2DObject();
    backgroundObject.position = [0.0, 0.0];
    backgroundObject.size = [1.0, 1.0];
    backgroundObject.texture = backgroundTexture;

    let poissonObjectsBehindBulles = await glutils.GL2DPoissons.create("poisson.png");
    for(let i = 0; i < 6; i++) {
        let poisson = new glutils.Poisson();
        let scale = Math.random() * 0.1 + 0.01;
        poisson.position = [Math.random(), Math.random(), scale, scale];
        poissonObjectsBehindBulles.poissons.push(poisson);
    }
    let poissonObjectsFrontBulles = await glutils.GL2DPoissons.create("poisson.png");
    for(let i = 0; i < 6; i++) {
        let poisson = new glutils.Poisson();
        let scale = Math.random() * 0.1 + 0.01;
        poisson.position = [Math.random(), Math.random(), scale, scale];
        poissonObjectsFrontBulles.poissons.push(poisson);
    }

    let bullesObjects = await glutils.GL2DBulles.create("bulle.png");


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
        gravity: [0, 1],
        bullesObjects: bullesObjects
    };
    monitorFPS(canvas, runtimeState);

    handleInteractions(canvas, runtimeState);
    handleGravity(runtimeState);

    let bulleLocations: vec3[] = [
        // Purple
        [0.170, 0.210, 0.02],
        [0.215, 0.185, 0.01],
        [0.232, 0.152, 0.01],

        // Orange
        [0.745, 0.170, 0.015],
        [0.760, 0.245, 0.027],
        [0.812, 0.310, 0.025],
        [0.850, 0.232, 0.015],
    ];

    const fpsInterval = 1000 / 61.0;
    let expectedFrameDate = Date.now();

    let fast_fps_mode = false;
    let bulleSpeed = 0.0005;

    function updateAnimation(timestamp: DOMHighResTimeStamp) {
        let now = Date.now();
        if (now >= expectedFrameDate || fast_fps_mode) {
            expectedFrameDate += Math.trunc((now - expectedFrameDate) / fpsInterval + 1) * fpsInterval;

            // Generate fixed bulle
            for(let bulleLocation of bulleLocations) {
                if(Math.random() < 0.005) {
                    bullesObjects.addBulle(bulleLocation[0], bulleLocation[1], bulleLocation[2]);
                }
            }

            runtimeState.frameCount++;
            {
                if(runtimeState.x != -1 && runtimeState.y != -1) {
                    runtimeState.x = runtimeState.x / window.innerWidth;
                    runtimeState.y = runtimeState.y / window.innerHeight;
                    let bulleSize = 0.02;
                    bullesObjects.addBulle(runtimeState.x - bulleSize, runtimeState.y - bulleSize, bulleSize*2);

                    runtimeState.x = -1;
                    runtimeState.y = -1;
                }

                // Render objects
                backgroundObject.bindObject(programInfo.uniformLocations.position);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

                poissonObjectsBehindBulles.drawObjects(programInfo.uniformLocations.position, bullesObjects);
                
                bullesObjects.drawObjects(programInfo.uniformLocations.position, [runtimeState.gravity[0] * bulleSpeed, runtimeState.gravity[1] * bulleSpeed]);
                poissonObjectsFrontBulles.drawObjects(programInfo.uniformLocations.position, bullesObjects);
            }
        }

        if(fast_fps_mode)
            setTimeout(updateAnimation, 1);
        else
            window.requestAnimationFrame(updateAnimation);
    }
    if(fast_fps_mode)
        setTimeout(updateAnimation, 1);
    else
        window.requestAnimationFrame(updateAnimation);
})();
