// Vertex shader program
export const vsSource = `#version 100
    #ifdef GL_ES
    precision mediump float;
    #endif

    attribute vec2 in_quad;
    uniform vec4 position;
    varying vec2 vTexCoord;
    
    // Orthographic projection with left right bottom top = 0, 1, 0, 1
    const mat4 projection = mat4(
        2.0,    0.0,   0.0,  0.0,
        0.0,    2.0,   0.0,  0.0,
        0.0,    0.0,  -1.0,  0.0,
        -1.0,  -1.0,   0.0,  1.0);

    void main() {
        vec2 vertice = (in_quad * position.zw + position.xy);
        gl_Position = projection * vec4(vertice, 0.0, 1.0);
        vTexCoord = in_quad;
    }
  `;
// Fragment shader program
export const fsPreprocessEnvironmentSource = `#version 100
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 vTexCoord;
uniform sampler2D backgroundTextures[1];

vec4 get_background(sampler2D sampler, vec2 offset, float scale) {
    return texture2D(sampler, (vTexCoord.xy + offset) / scale);
}

void main() {
    vec4 texture1 = get_background(backgroundTextures[0], vec2(0.0, 0.0), 1.0);

    vec4 blend = texture1.rgba;

    gl_FragColor = blend;
}
  `;
export const fsScreen = `#version 100
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 vTexCoord;
uniform sampler2D backgroundTexture;

void main() {
    gl_FragColor = texture2D(backgroundTexture, vTexCoord.xy);
    //gl_FragColor = vec4(vTexCoord.xy, 0.0, 1.0);
}
`;
//# sourceMappingURL=shaders.js.map