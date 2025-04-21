var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as shaders from './shaders.js';
let gl;
let canvas;
export function initOpenGL(input_canvas) {
    gl = input_canvas.getContext('webgl', { alpha: false, antialias: false });
    canvas = input_canvas;
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    return gl;
}
export class GL2DObject {
    static createGL2DObject(image, x, y, width, height) {
        return __awaiter(this, void 0, void 0, function* () {
            let image_html = yield getImageData(image);
            let obj = new GL2DObject();
            obj.position = [x, y];
            obj.size = [width, height];
            obj.texture = textureFromImage(image_html);
            return obj;
        });
    }
    bindObject(positionUniform) {
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform4f(positionUniform, -this.position[0], -this.position[1], 1 / this.size[0], 1 / this.size[1]);
    }
}
;
export function addImageProcess(src) {
    return new Promise((resolve, reject) => {
        let img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.crossOrigin = "anonymous";
        img.src = src;
    });
}
export function getImageData(image) {
    return __awaiter(this, void 0, void 0, function* () {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        // 2) Copy your image data into the canvas
        return addImageProcess(image);
    });
}
//
// creates a shader of the given type, uploads the source and
// compiles it.
//
export function loadShader(type, source) {
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
export function initShaderProgram(vsSource, fsSource) {
    const vertexShader = loadShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fsSource);
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
export function initPositionBuffer() {
    // Create a buffer for the square's positions.
    const positionBuffer = gl.createBuffer();
    // Select the positionBuffer as the one to apply buffer
    // operations to from here out.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    // Now create an array of positions for the square.
    const positions = [
        //  x  y
        0, 0,
        1, 0,
        0, 1,
        1, 1
    ];
    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    return positionBuffer;
}
export function nearestPowerOf2(n) {
    return 1 << 32 - Math.clz32(n);
}
export function texture(width, height) {
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
export function textureFromImage(image) {
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
export function prepareVertices(quad_uniform) {
    const positionBuffer = initPositionBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(quad_uniform);
    gl.vertexAttribPointer(quad_uniform, 2, gl.FLOAT, false, 0, 0);
}
export function prepareViewport(width, height) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, width, height);
}
let snow_count = 0;
export function initializeSnowState(state) {
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
export function prepareEnvironment(backgroundTexture, framebuffer) {
    return __awaiter(this, void 0, void 0, function* () {
        const shaderPreprocessEnvironmentProgram = initShaderProgram(shaders.vsSource, shaders.fsPreprocessEnvironmentSource);
        const programProcessEnvironmentInfo = {
            program: shaderPreprocessEnvironmentProgram,
            attribLocations: {
                quad: gl.getAttribLocation(shaderPreprocessEnvironmentProgram, "in_quad"),
            },
            uniformLocations: {
                position: gl.getUniformLocation(shaderPreprocessEnvironmentProgram, "position"),
                backgroundTextures: gl.getUniformLocation(shaderPreprocessEnvironmentProgram, "backgroundTextures"),
            },
        };
        let aquarium_image = yield getImageData("aquarium.png");
        gl.activeTexture(gl.TEXTURE0 + 1);
        const aquariumTexture = textureFromImage(aquarium_image);
        // Render to texture
        gl.useProgram(programProcessEnvironmentInfo.program);
        // Set the shader uniforms
        gl.uniform4f(programProcessEnvironmentInfo.uniformLocations.position, 0, 0, 1, 1);
        gl.uniform1iv(programProcessEnvironmentInfo.uniformLocations.backgroundTextures, [1]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, backgroundTexture, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(aquariumTexture);
        gl.deleteProgram(programProcessEnvironmentInfo.program);
    });
}
//# sourceMappingURL=gl-utils.js.map