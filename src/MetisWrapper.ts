import * as METIS from "../build/metis"
import {WASMHelper, WASMPointer} from "./util/WasmHelper"

export class METISWrapper {
    private static METIS

    private static async load() {
        if (!METISWrapper.METIS) {
            METISWrapper.METIS = await METIS.default()
        }
    }

    public static async partition(groups: number[][], nparts: number)
        : Promise<number[][]>
    {
        await METISWrapper.load()

        // From: pymetis
        function _prepare_graph(adjacency: number[][]) {
            function assert(condition: boolean) {
                if (!condition) throw Error("assert")
            }

            let xadj: number[] = [0]
            let adjncy: number[] = []

            for (let i = 0; i < adjacency.length; i++) {
                let adj = adjacency[i]
                if (adj !== null && adj.length) {
                    assert(Math.max(...adj) < adjacency.length)
                }
                adjncy.push(...adj)
                xadj.push(adjncy.length)
            }

            return [xadj, adjncy]
        }

        const [_xadj, _adjncy] = _prepare_graph(groups)

        const objval = new WASMPointer(new Uint32Array(1), "out")
        const parts = new WASMPointer(new Uint32Array(_xadj.length - 1), "out")

        const options_array = new Int32Array(40)
        options_array.fill(-1)

        WASMHelper.call(METISWrapper.METIS, "METIS_PartGraphKway", "number", 
            new WASMPointer(new Int32Array([_xadj.length - 1])),    // nvtxs
            new WASMPointer(new Int32Array([1])),                   // ncon
            new WASMPointer(new Int32Array(_xadj)),                 // xadj
            new WASMPointer(new Int32Array(_adjncy)),               // adjncy
            null,                                                   // vwgt
            null,                                                   // vsize
            null,                                                   // adjwgt
            new WASMPointer(new Int32Array([nparts])),              // nparts
            null,                                                   // tpwgts
            null,                                                   // ubvec
            new WASMPointer(options_array),                         // options
            objval,                                                 // objval
            parts,                                                  // part
        )

        const part_num = Math.max(...parts.data)

        const parts_out: number[][] = []
        for (let i = 0; i <= part_num; i++) {
            const part: number[] = []

            for (let j = 0; j < parts.data.length; j++) {
                if (parts.data[j] === i) {
                    part.push(j)
                }
            }

            if (part.length > 0) {
                parts_out.push(part)
            }
        }

        return parts_out
    }
}
