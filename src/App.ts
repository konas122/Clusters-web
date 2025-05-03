import * as THREE from "three"

import { Config } from "./config"
import { BetterStats, Stat } from "./BetterStats"

import { OBJLoaderIndexed } from "./OBJLoaderIndexed"
import { MeshletMerger } from "./MeshletMerger"

import { MeshletSimplifier_wasm } from "./util/MeshletSimplifier"
import { MeshletCleaner } from "./util/MeshletCleaner"
import { Vertex, Meshlet } from "./Meshlet"
import { MeshletCreator } from "./util/MeshletCreator"
import { MeshletGrouper } from "./MeshletGrouper"
import { MeshSimplifyScale } from "./util/MeshSimplifyScale"
import { MeshletObject3D } from "./MeshletObject3D"

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js"
import Stats from "three/examples/jsm/libs/stats.module.js"

export class App {
    private canvas: HTMLCanvasElement

    private renderer: THREE.WebGLRenderer
    private scene: THREE.Scene
    private camera: THREE.PerspectiveCamera
    private controls: OrbitControls

    private stats: BetterStats
    private statsT: Stats
    private lodStat: Stat
    private gui: GUI

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas, antialias: true
        })
        this.scene = new THREE.Scene()
        this.camera = new THREE.PerspectiveCamera(
            32, this.canvas.width / this.canvas.height, 0.01, 10000
        )
        this.camera.position.z = 1

        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.target.set(0.0, 0.3, 0)
        this.controls.update()

        this.stats = new BetterStats(this.renderer)
        document.body.appendChild(this.stats.domElem())

        this.statsT = new Stats()
        document.body.appendChild(this.statsT.dom)

        this.lodStat = new Stat("TestLOD", `0ms`)
        this.stats.addStat(this.lodStat)

        this.gui = new GUI()

        this.gui.add(Config.get(), 'DEBUG')
            .onChange((value: boolean) => {
                Config.get().DEBUG = value
                location.reload()
            })
        this.gui.add(Config.get(), 'Layout', ['x', 'xx', 'xxx'])
            .onChange((value: string) => {
                Config.get().Layout = value
                location.reload()
            })
        this.gui.add(Config.get(), 'Model', ['Dragon', 'Bunny', 'Teapot', 'Armadillo'])
            .onChange((value: string) => {
                Config.get().Model = value
                location.reload()
            })

        this.render()
    }

    private static rand(co: number) {
        function fract(n) {
            return n % 1
        }
        return fract(Math.sin((co + 1) * 12.9898) * 43758.5453)
    }

    private createMesh(
        vertices: ArrayLike<number>, indices: ArrayLike<number>,
        params: {
            color?: number, position?: number[],
            opacity?: number, scale?: number[]
        },
    ): THREE.Mesh
    {
        let g = new THREE.BufferGeometry()
        g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3))
        g.setIndex(new THREE.Uint16BufferAttribute(indices, 1))

        const m = new THREE.MeshBasicMaterial({
            wireframe: false,
            color: params.color ? params.color : 0xffffff,
            transparent: params.opacity ? true : false,
            opacity: params.opacity ? params.opacity : 0.0
        })
        const mesh = new THREE.Mesh(g, m)
        if (params.position) {
            mesh.position.set(params.position[0], params.position[1], params.position[2])
        }
        if (params.scale) {
            mesh.scale.set(params.scale[0], params.scale[1], params.scale[2])
        }
        this.scene.add(mesh)

        return mesh
    }

    private showMeshlets(meshlets: Meshlet[], position: number[], scale?: number[], color?: number): THREE.Mesh[] {
        let meshes: THREE.Mesh[] = []
        for (let i = 0; i < meshlets.length; i++) {
            const meshlet_color = color ? color : App.rand(i) * 0xffffff
            const mesh = this.createMesh(
                meshlets[i].vertices_raw, meshlets[i].indices_raw,
                { color: meshlet_color, position: position, scale: scale }
            )
            meshes.push(mesh)
        }
        return meshes
    }

    private render() {
        this.stats.update()
        this.statsT.update()

        this.renderer.render(this.scene, this.camera)

        requestAnimationFrame(() => { this.render() })
    }

    public async processObj(objURL: string) {
        OBJLoaderIndexed.load(objURL, async (objMesh) => {
            const objVertices = objMesh.vertices
            const objIndices = objMesh.indices

            // Original mesh
            const xO = 0.3
            const yO = -0.3
            const DEBUG = Config.get().DEBUG

            async function appendMeshlets(
                simplifiedGroup: Meshlet, center: Vertex, error: number
            ): Promise<Meshlet[]> {
                const split = await MeshletCreator.build(
                    simplifiedGroup.vertices_raw, simplifiedGroup.indices_raw, 255, 128
                )
                for (let s of split) {
                    s.clusterError = error
                    s.center = center
                }
                return split
            }

            let previousMeshlets: Map<number, Meshlet> = new Map()

            const step = async (
                meshlets: Meshlet[], y: number, scale = [1, 1, 1], lod: number
            ): Promise<Meshlet[]> => {
                if (previousMeshlets.size === 0) {
                    for (let m of meshlets) {
                        previousMeshlets.set(m.id, m)
                    }
                }

                let nparts = Math.ceil(meshlets.length / 4)
                let grouped = [meshlets]
                if (nparts > 1) {
                    grouped = await MeshletGrouper.group(meshlets, nparts)
                }

                let x = 0
                let splitOutputs: Meshlet[] = []
                for (let i = 0; i < grouped.length; i++) {
                    const group = grouped[i]

                    // merge
                    const mergedGroup = MeshletMerger.merge(group)
                    const cleanedMergedGroup = await MeshletCleaner.clean(mergedGroup)

                    // simplify
                    const simplified = await MeshletSimplifier_wasm.simplify(
                        cleanedMergedGroup, cleanedMergedGroup.indices_raw.length / 2
                    )
                    const localScale = await MeshSimplifyScale.scaleError(simplified.meshlet)

                    let meshSpaceError = simplified.result_error * localScale
                    let childrenError = 0.0

                    for (let m of group) {
                        const previousMeshlet = previousMeshlets.get(m.id)
                        if (!previousMeshlet) {
                            throw Error("Could not find previous meshler")
                        }

                        childrenError = Math.max(childrenError, previousMeshlet.clusterError)
                    }
                    meshSpaceError += childrenError

                    for (let m of group) {
                        const previousMeshlet = previousMeshlets.get(m.id)
                        if (!previousMeshlet) {
                            throw Error("Could not find previous meshler")
                        }

                        previousMeshlet.parentError = meshSpaceError
                        previousMeshlet.parentCenter = simplified.meshlet.center
                    }

                    const out = await appendMeshlets(
                        simplified.meshlet, simplified.meshlet.center, meshSpaceError
                    )

                    for (let o of out) {
                        previousMeshlets.set(o.id, o)
                        splitOutputs.push(o)
                    }

                    for (let m of group) {
                        m.children.push(...out)
                        m.lod = lod
                    }
                    for (let s of out) {
                        s.parents.push(...group)
                    }

                    if (DEBUG) {
                        this.showMeshlets(group, [x + (xO * 1), y, 0], [1, 1, 1], App.rand(i) * 0xffffff)
                        this.showMeshlets([cleanedMergedGroup], [x + (xO * 2), y, 0], [1, 1, 1], App.rand(i) * 0xffffff)
                        this.showMeshlets([simplified.meshlet], [+ (xO * 3), y, 0], [1, 1, 1], App.rand(i) * 0xffffff)
                    }
                }

                if (DEBUG) {
                    this.showMeshlets(meshlets, [0.0, y, 0], scale)
                    this.showMeshlets(splitOutputs, [+ (xO * 4), y, 0], [1, 1, 1])
                }

                return splitOutputs
            }

            const meshlets = await MeshletCreator.build(objVertices, objIndices, 255, 128)

            let rootMeshlet: Meshlet | null = null

            const maxLOD = 25
            let y = 0.0
            let inputs = meshlets

            for (let lod = 0; lod < maxLOD; lod++) {
                const outputs = await step(inputs, y, [1, 1, 1], lod)

                console.log("inputs", inputs.map(m => m.indices_raw.length / 3))
                console.log("outputs", outputs.map(m => m.indices_raw.length / 3))

                if (outputs.length === 1) {
                    console.log("WE are done at lod", lod)
                    rootMeshlet = outputs[0]
                    rootMeshlet.lod = lod + 1
                    rootMeshlet.parentCenter = rootMeshlet.center
                    break
                }

                inputs = outputs
                y += yO
                console.log("\n")
            }
            console.log("root", rootMeshlet)

            if (rootMeshlet === null) {
                throw Error("Root meshlet is invalid!")
            }

            function traverse(
                meshlet: Meshlet,
                fn: (meshlet: Meshlet) => void,
                visited: number[] = []
            ) {
                if (visited.indexOf(meshlet.id) !== -1) {
                    return
                }

                fn(meshlet)
                visited.push(meshlet.id)

                for (let child of meshlet.parents) {
                    traverse(child, fn, visited)
                }
            }

            const allMeshlets: Meshlet[] = []
            traverse(rootMeshlet, m => allMeshlets.push(m))
            console.log("total meshlets", allMeshlets.length)

            const m = new MeshletObject3D(allMeshlets, this.lodStat)
            this.scene.add(m.mesh)

            switch (Config.getLayout()) {
                case 'x':
                    for (let x = 0; x < 20; x++) {
                        for (let y = 0; y < 20; y++) {
                            m.addMeshletAtPosition(new THREE.Vector3(x, 0, y))
                        }
                    }

                case 'xx':
                    for (let x = 0; x < 20; x++) {
                        for (let y = 0; y < 20; y++) {
                            m.addMeshletAtPosition(new THREE.Vector3(x, 0, y))
                        }
                    }
                case 'xxx':
                    for (let x = 0; x < 10; x++) {
                        for (let y = 0; y < 10; y++) {
                            for (let z = 0; z < 10; z++) {
                                m.addMeshletAtPosition(new THREE.Vector3(x, z, y))
                            }
                        }
                    }
                default:
                    for (let x = 0; x < 20; x++) {
                        for (let y = 0; y < 20; y++) {
                            m.addMeshletAtPosition(new THREE.Vector3(x, 0, y))
                        }
                    }
            }
        })
    }
}
