
/// <reference path='./gl-matrix/types.d.ts'/>
import * as vec2 from './gl-matrix/vec2.js'
import * as shaders from './shaders.js'

let gl: WebGLRenderingContext;
let canvas: HTMLCanvasElement;


export function initOpenGL(input_canvas: HTMLCanvasElement) {
    gl = input_canvas.getContext('webgl', { alpha: false, antialias: false }) as WebGLRenderingContext;
    canvas = input_canvas;

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    return gl;
}


export class GL2DObject {
    public position: vec2;
    public size: vec2;
    public texture: WebGLTexture;

    static async create(image: string, x: number, y: number, width: number, height: number) {
        let image_html: HTMLImageElement = await getImageData(image);
    
        let obj = new GL2DObject();
        obj.position = [x, y];
        obj.size = [width, height];
        obj.texture = textureFromImage(image_html);

        return obj;
    }

    bindObject(positionUniform: WebGLUniformLocation) {
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform4f(positionUniform, this.position[0], this.position[1], this.size[0], this.size[1]);
    }
};


export class GL2DBulles {
    public positions: vec4[];
    public texture: WebGLTexture;

    static async create(image: string) {
        let image_html: HTMLImageElement = await getImageData(image);
    
        let obj = new GL2DBulles();
        obj.positions = [];
        obj.texture = textureFromImage(image_html);

        return obj;
    }

    drawObjects(positionUniform: WebGLUniformLocation, upVector: vec2) {
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        for(let i = 0; i < this.positions.length;) {
            let position = this.positions[i];
            position[0] += upVector[0];
            position[1] += upVector[1];

            // Remove if out of bounds
            if(position[0] + position[2] < 0 || position[1] + position[3] < 0 || position[0] >= 1 || position[1] >= 1) {
                this.positions.splice(i, 1);
                continue;
            }
            
            gl.uniform4f(positionUniform, position[0], position[1], position[2], position[3]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            i++;
        }
    }

    addBulle(x: number, y: number, scale: number) {
        if(this.positions.length < 1000) {
            this.positions.push([x, y, scale, scale]);
        }
    }

};

enum PoissonState {
    MovingForward,
    MovingBackward,
    Idle,
}
let poissonStatesNumber = 3;

export class Poisson {
    public position: vec4;
    public state: PoissonState = PoissonState.MovingForward;
    
    nextUpdateIn: number = 0;

    update(bulleObjects: GL2DBulles) {
        switch(this.state) {
            case PoissonState.MovingForward:
                if(this.position[0] + this.position[2] < 1) {
                    this.position[0] += 0.0005;
                    if(this.position[2] != this.position[3]) {
                        this.position[2] = this.position[3];
                        this.position[0] -= this.position[2];
                    }
                } else {
                    this.nextUpdateIn = 0;
                }
                break;
            case PoissonState.MovingBackward:
                if(this.position[0] + this.position[2] > 0) {
                    this.position[0] -= 0.0005;
                    if(this.position[2] == this.position[3]) {
                        this.position[2] = -this.position[3];
                        this.position[0] -= this.position[2];
                    }
                } else {
                    this.nextUpdateIn = 0;
                }
                break;
            
            default:
                if(Math.random() < 0.005) {
                    bulleObjects.addBulle(this.position[0] + this.position[2]*0.9, this.position[1] + this.position[3] / 2, this.position[3] / 5);
                }
                break;
        }
        this.nextUpdateIn = this.nextUpdateIn - 1;
        if(this.nextUpdateIn <= 0) {
            this.state = Math.floor(Math.random() * poissonStatesNumber) as PoissonState;
            if(this.state == PoissonState.Idle) {
                this.nextUpdateIn = (Math.random() * 3) * 60;
            } else {
                this.nextUpdateIn = (Math.random() * 5 + 5) * 60;
            }
        }
    }
}


export class GL2DPoissons {
    public poissons: Poisson[];
    public texture: WebGLTexture;

    static async create(image: string) {
        let image_html: HTMLImageElement = await getImageData(image);
    
        let obj = new GL2DPoissons();
        obj.poissons = [];
        obj.texture = textureFromImage(image_html);

        return obj;
    }

    drawObjects(positionUniform: WebGLUniformLocation, bulleObjects: GL2DBulles) {
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        for(let poisson of this.poissons) {
            poisson.update(bulleObjects);
            gl.uniform4f(positionUniform, poisson.position[0], poisson.position[1], poisson.position[2], poisson.position[3]);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    }
};


export function addImageProcess(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        let img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.crossOrigin = "anonymous";
        img.src = src
    })
}

export async function getImageData(image: string): Promise<HTMLImageElement> {
    var canvas = document.createElement('canvas');
    var ctx: CanvasRenderingContext2D = canvas.getContext('2d') as CanvasRenderingContext2D;

    // 2) Copy your image data into the canvas
    return addImageProcess(image);
}


//
// creates a shader of the given type, uploads the source and
// compiles it.
//
export function loadShader(type: any, source: any) {
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

export function initShaderProgram(vsSource: string, fsSource: string) {
    const vertexShader = loadShader(gl.VERTEX_SHADER, vsSource) as WebGLShader;
    const fragmentShader = loadShader(gl.FRAGMENT_SHADER, fsSource) as WebGLShader;

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
        1, 1];

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

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
        width, height,
        0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    return tex;
};

export function textureFromImage(image: HTMLImageElement) {
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

export function prepareVertices(quad_uniform: number) {
    const positionBuffer = initPositionBuffer();

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

export function prepareViewport(width, height) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0.0, 0.0, 0.0, 1.0); // Clear to black, fully opaque
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, width, height);
}

let snow_count = 0;
export function initializeSnowState(state: WebGLTexture) {
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

export async function prepareEnvironment(backgroundTexture: WebGLTexture | null, framebuffer: WebGLFramebuffer | null) {
    const shaderPreprocessEnvironmentProgram = initShaderProgram(shaders.vsSource, shaders.fsPreprocessEnvironmentSource) as WebGLProgram;
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

    let aquarium_image: HTMLImageElement = await getImageData("aquarium.png");

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
}
