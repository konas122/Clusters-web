flat in int meshletInstanceID;

vec3 hashColor(int seed) {
    uint x = uint(seed);
    x = ((x >> 16u) ^ x) * 0x45d9f3bu;
    x = ((x >> 16u) ^ x) * 0x45d9f3bu;
    x = (x >> 16u) ^ x;
    return vec3(
        float((x & 0xFF0000u) >> 16u) / 255.0,
        float((x & 0x00FF00u) >> 8u) / 255.0,
        float(x & 0x0000FFu) / 255.0
    );
}

void main() {
    vec3 color = hashColor(meshletInstanceID);
    gl_FragColor = vec4(color, 1.0);
}
