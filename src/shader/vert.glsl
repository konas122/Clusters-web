uniform sampler2D vertexTexture;
uniform float verticesTextureSize;

attribute vec3 localPosition;
attribute float index;

flat out int meshInstanceID;
flat out int meshletInstanceID;
flat out int vertexID;

void main() {
    float instanceID = float(gl_InstanceID);

    float vid = mod(float(gl_VertexID), 384.0);
    float i = float(index) + vid;
    float x = mod(i, verticesTextureSize);
    float y = floor(i / verticesTextureSize);
    vec3 pos = texelFetch(vertexTexture, ivec2(x, y), 0).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos + localPosition, 1.0);

    meshInstanceID = gl_InstanceID;
    meshletInstanceID = int(index);
    vertexID = int(vid);
}
