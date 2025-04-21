
// Vertex shader program

export const vsSource = `#version 100
    #ifdef GL_ES
    precision mediump float;
    #endif

    attribute vec2 in_quad;
    uniform vec4 position;
    varying vec2 vTexCoord;

    mat4 ortho(float left, float right, float bottom, float top) {
        // Ortho matrix
        float near = -1.0;
        float far = 1.0;
        float rl = right - left;
        float tb = top - bottom;
        float fn = far - near;

        return mat4( 2.0/rl,    0.0,   0.0,  0.0,
                      0.0,   2.0/tb,   0.0,  0.0,
                      0.0,    0.0, -2.0/fn,  0.0,
                      -(right + left)/rl,    -(top + bottom)/tb,   -(far + near)/fn,  1.0);
        
    }

    void main() {
        mat4 projection = ortho(position.x, position.y, position.z, position.w);
        gl_Position = projection * vec4(in_quad.xy, 0.0, 1.0);
        vTexCoord = in_quad.xy;
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
}
  `;
