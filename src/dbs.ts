import { Buffer } from 'buffer'
import { MD5 } from "crypto-js"
import { v4 as uuidv4 } from 'uuid';



export const F_ID = "__id__";
export const F_VECTOR = "__vector__";
export const F_METRICS = "__metrics__";

/**
 * 类型.d.ts
 */


export interface Data {
    [F_ID]: string;
    [F_VECTOR]?: Float32Array;
    [key: string]: any;
}

export interface DataBase {
    embedding_dim: number;
    data: Data[];
    matrix: Float32Array[];
    additional_data?: { [key: string]: any }; // 添加 additional_data 属性
}

export interface DataBaseLoad {
    embedding_dim: number;
    data: Data[];
    matrix: string;
    additional_data?: { [key: string]: any }; // 添加 additional_data 属性
}

export type Metric = 'cosine';

export type ConditionLambda = (data: Data) => boolean;



/**
 * Converts a Float32Array to a Base64 string.
 * @param array - The Float32Array to convert.
 * @returns Base64 encoded string.
 */
function arrayToBufferString(array: Buffer): string {
    // console.log("arrayToBufferString", array)
    return Buffer.from(array.buffer).toString('base64');
}

/**
 * Converts a Base64 string back to a Float32Array.
 * @param base64Str - The Base64 string to convert.
 * @returns The resulting Float32Array.
 */
function bufferStringToArray(base64Str: string): Float32Array {
    return new Float32Array(Buffer.from(base64Str, 'base64').buffer);
}

/**
 * Loads storage from a JSON file.
 * @param fileName - The path to the JSON file.
 * @returns The loaded DataBase object or null if the file doesn't exist.
 */
async function loadStorage(fileName: string, loadJsonFunc?: (filePath: string) => Promise<Record<string, any>>): Promise<DataBase | null> {
    // if (!fs.existsSync(fileName)) {
    //     return null;
    // }
    function reshapeArray(array: Float32Array, shape: [number, number]): Float32Array[] {
        const [rows, cols] = shape;
        const result: Float32Array[] = [];
        for (let i = 0; i < rows; i++) {
            result.push(array.slice(i * cols, (i + 1) * cols));
        }
        return result;
    }
    const dataLoad = await loadJson(fileName, loadJsonFunc) as DataBaseLoad;
    // console.log("dataLoad", dataLoad)
    if (!dataLoad["matrix"]) return null;
    const matrix = bufferStringToArray(dataLoad["matrix"] as string);
    const matrixReshape = reshapeArray(matrix, [dataLoad["data"].length, dataLoad["embedding_dim"]]);
    // console.log("matrixReshape", matrixReshape)
    const data: DataBase = { ...dataLoad, "matrix": matrixReshape };
    // console.log("data", data)

    console.log(`Load (${data["matrix"].length}, ${data["matrix"][0].length}) data`);
    return data;
}

/**
 * Generates an MD5 hash for a Float32Array.
 * @param array - The Float32Array to hash.
 * @returns The MD5 hash as a hexadecimal string.
 */
function hashNdarray(array: Float32Array): string {
    // 将 Float32Array 转换为十六进制字符串
    // console.log("hashNdarray", array)
    // console.log("hashNdarray", typeof array)
    const hexString = array.reduce((acc, value) => {
        const hex = value.toString(16);
        return acc + (hex.length === 8 ? hex : '0'.repeat(8 - hex.length) + hex);
    }, '');

    // 使用 crypto-js 计算 MD5 哈希值
    return MD5(hexString).toString();
}

/**
 * Normalizes a Float32Array.
 * @param array - The Float32Array to normalize.
 * @returns The normalized Float32Array.
 */
function normalize(array: Float32Array): Float32Array {
    const norm = Math.sqrt(array.reduce((acc, val) => acc + val * val, 0));
    return array.map(val => val / norm);
}

class NanoVectorDB {
    embedding_dim: number;
    metric: Metric;
    storage_file: string;
    storage: DataBase;
    usable_metrics: { [key in Metric]: Function };
    isLoaded: boolean;
    loadJsonFunc?: (filePath: string) => Promise<Record<string, any>>;
    writeJsonFunc?: (jsonObject: Record<string, any>, filePath: string) => Promise<void>;
    isSync: boolean; // 是否同步加载，主要是加载数据是异步的

    // constructor({embedding_dim: number, metric: Metric = 'cosine', storage_file: string = 'nano-vectordb.json', 
    //     loadJsonFunc?: (filePath: string) => Promise<Record<string, any>>, 
    //     writeJsonFunc?: (jsonObject: Record<string, any>, filePath: string) => Promise<void>,
    //     isSync: boolean = false}) {
    //     this.embedding_dim = embedding_dim;
    //     this.metric = metric;
    //     this.storage_file = storage_file;
    //     this.loadJsonFunc = loadJsonFunc;
    //     this.writeJsonFunc = writeJsonFunc;
    //     this.usable_metrics = {
    //         "cosine": this.cosineQuery.bind(this),
    //     };
    //     this.storage = { embedding_dim: this.embedding_dim, data: [], matrix: [] }; // 初始化 storage
    //     this.isLoaded = false

    //     this.isSync = isSync;
    //     if(!this.isSync) { // 如果不同步加载，则需要异步加载
    //         this.postInit();
    //     }
        
    // }
    constructor({
        embedding_dim,
        metric = 'cosine',
        storage_file = 'nano-vectordb.json',
        loadJsonFunc,
        writeJsonFunc,
        isSync = false
    }: {
        embedding_dim: number;
        metric?: Metric;
        storage_file?: string;
        loadJsonFunc?: (filePath: string) => Promise<Record<string, any>>;
        writeJsonFunc?: (jsonObject: Record<string, any>, filePath: string) => Promise<void>;
        isSync?: boolean;
    }) {
        this.embedding_dim = embedding_dim;
        this.metric = metric;
        this.storage_file = storage_file;
        this.loadJsonFunc = loadJsonFunc;
        this.writeJsonFunc = writeJsonFunc;
        this.usable_metrics = {
            "cosine": this.cosineQuery.bind(this),
        };
        this.storage = { embedding_dim: this.embedding_dim, data: [], matrix: [] }; // 初始化 storage
        this.isLoaded = false;

        this.isSync = isSync;
        if (!this.isSync) { // 如果不同步加载，则需要异步加载
            this.postInit();
        }
    }

    public async postInit() {
        const defaultStorage: DataBase = {
            embedding_dim: this.embedding_dim,
            data: [],
            matrix: [],
        };
        this.storage = await loadStorage(this.storage_file, this.loadJsonFunc) || defaultStorage;
        if (this.storage.embedding_dim !== this.embedding_dim) {
            throw new Error(`Embedding dim mismatch, expected: ${this.embedding_dim}, but loaded: ${this.storage.embedding_dim}`);
        }
        if (!(this.metric in this.usable_metrics)) {
            throw new Error(`Metric ${this.metric} not supported`);
        }
        this.preProcess();
        // console.log(`Init ${JSON.stringify(this)} with ${this.storage.data.length} data`);
        console.log(`Init with ${this.storage.data.length} data`);
        this.isLoaded = true
    }

    private preProcess() {
        if (this.metric === 'cosine') {
            this.storage.matrix = this.storage.matrix.map(normalize);
        }
    }

    getAdditionalData(): { [key: string]: any } {
        return this.storage.additional_data || {};
    }

    storeAdditionalData(kwargs: { [key: string]: any }) {
        this.storage.additional_data = kwargs;
    }

    upsert(datas: Data[]): { update: string[], insert: string[] } {
        // console.log("upsert", datas[0][F_VECTOR])
        const indexData: { [key: string]: Data } = {};
        datas.forEach(data => {
            // console.log(data[F_VECTOR])
            if (!data[F_VECTOR]) return;
            const key = data[F_ID] || hashNdarray(data[F_VECTOR]);
            indexData[key] = data;
        });
        // console.log("indexData", indexData)
        if (this.metric === 'cosine') {
            Object.values(indexData).forEach(v => {
                if (!v[F_VECTOR]) return;
                v[F_VECTOR] = normalize(v[F_VECTOR]);
            });
        }
        // console.log("indexData", indexData)
        const reportReturn = { update: [] as string[], insert: [] as string[] };
        this.storage.data.forEach((alreadyData, i) => {
            if (alreadyData[F_ID] in indexData) {
                const updateData = indexData[alreadyData[F_ID]];
                if (!updateData[F_VECTOR]) return
                // console.log("updateData", updateData[F_VECTOR])
                this.storage.matrix[i] = updateData[F_VECTOR];
                const { [F_VECTOR]: _, ...rest } = updateData; // 解构赋值，移除 F_VECTOR
                delete updateData[F_VECTOR];
                this.storage.data[i] = updateData;
                reportReturn.update.push(alreadyData[F_ID]);
                delete indexData[alreadyData[F_ID]];
            }
        });

        const remainingKeys = Object.keys(indexData);
        // console.log("remainingKeys", remainingKeys)
        if (remainingKeys.length === 0) {
            return reportReturn;
        }

        reportReturn.insert.push(...remainingKeys);
        remainingKeys.forEach(key => {
            const newData = indexData[key];
            // console.log("newData", newData)
            // console.log("indexData[key]", indexData[key].__vector__)
            // delete newData[F_VECTOR]; // 会删除掉indexData[key]的__vector__字段
            // console.log("indexData[key]", indexData[key].__vector__)

            if (!indexData[key][F_VECTOR]) return
            this.storage.matrix.push(indexData[key][F_VECTOR]);

            delete newData[F_VECTOR]; // 会删除掉indexData[key]的__vector__字段
            newData[F_ID] = key;
            this.storage.data.push(newData);
        });

        return reportReturn;
    }

    /**
     * 获取数据
     * @param ids 
     * @returns Data[] 只能获取到key,即返回的Data[]只有__id__字段
     */
    get(ids: string[]): Data[] { 
        // console.log(this.storage.data)
        return this.storage.data.filter(data => ids.includes(data[F_ID]));
    }

    delete(ids: string[]) {
        const idSet = new Set(ids);
        console.log("idSet", idSet)

        const leftData: Data[] = []
        const deleteIndex: number[] = []
        this.storage.data.forEach((data, idx) => {
            if (idSet.has(data[F_ID])) {
                deleteIndex.push(idx)
            } else {
                leftData.push(data)
            }
        });
        this.storage.data = leftData
        this.storage.matrix = this.storage.matrix.filter((_, idx) => !deleteIndex.includes(idx));
    }

    save() {
        const buffers = this.storage.matrix.map(arr => Buffer.from(arr.buffer));
        const concatenatedBuffer = Buffer.concat(buffers);
        const storage = {
            ...this.storage,
            "matrix": arrayToBufferString(concatenatedBuffer),
        };
        // console.log("save storage:", storage);
        // TODO
        // 这里由于不同平台(浏览器/Nodejs/Zotero 对文件操作方式有所差异，所以，这里需要根据不同平台实现)
        writeJson(storage, this.storage_file, this.writeJsonFunc);
    }

    get length(): number {
        return this.storage.data.length;
    }

    query(query: Float32Array, top_k: number = 10, better_than_threshold?: number, filter_lambda?: ConditionLambda): object[] {
        return this.usable_metrics[this.metric](query, top_k, better_than_threshold, filter_lambda);
    }

    private cosineQuery(query: Float32Array, top_k: number, better_than_threshold: number | undefined, filter_lambda?: ConditionLambda): object[] {
        query = normalize(query);
        let use_matrix = this.storage.matrix;
        let filter_index: number[] = [];

        if (filter_lambda) {
            filter_index = this.storage.data
                .map((data, idx) => ({ data, idx }))
                .filter(item => filter_lambda(item.data))
                .map(item => item.idx);
            use_matrix = filter_index.map(idx => this.storage.matrix[idx]);
        } else {
            // filter_index = [...Array(this.storage.matrix.length).keys()];
            filter_index = Array.from({ length: this.storage.matrix.length }, (_, i) => i);
        }

        const scores = use_matrix.map(vec => dotProduct(vec, query));
        const sortedIndices = scores
            .map((score, idx) => ({ score, idx }))
            .sort((a, b) => b.score - a.score)
            .slice(0, top_k)
            .map(item => item.idx);

        const results: object[] = [];
        for (let i of sortedIndices) {
            const abs_i = filter_index[i];
            const score = scores[i];
            if (better_than_threshold !== undefined && score < better_than_threshold) {
                break;
            }
            results.push({ ...this.storage.data[abs_i], [F_METRICS]: score });
        }

        return results;
    }
}

/**
 * Calculates the dot product of two Float32Arrays.
 * @param a - First array.
 * @param b - Second array.
 * @returns The dot product.
 */
function dotProduct(a: Float32Array, b: Float32Array): number {
    return a.reduce((sum, val, idx) => sum + val * b[idx], 0);
}

class MultiTenantNanoVDB {
    embedding_dim: number;
    metric: Metric;
    max_capacity: number;
    storage_dir: string;
    private storage: Map<string, NanoVectorDB>;
    private cacheQueue: string[];
    loadJsonFunc?: (filePath: string) => Promise<Record<string, any>>;
    writeJsonFunc?: (jsonObject: Record<string, any>, filePath: string) => Promise<void>;

    constructor(embedding_dim: number, metric: Metric = 'cosine', max_capacity: number = 1000, storage_dir: string = './nano_multi_tenant_storage', 
        loadJsonFunc?: (filePath: string) => Promise<Record<string, any>>, 
        writeJsonFunc?: (jsonObject: Record<string, any>, filePath: string) => Promise<void>) {
        if (max_capacity < 1) {
            throw new Error("max_capacity should be greater than 0");
        }
        this.embedding_dim = embedding_dim;
        this.metric = metric;
        this.max_capacity = max_capacity;
        this.storage_dir = storage_dir;
        this.storage = new Map();
        this.cacheQueue = [];
        this.loadJsonFunc = loadJsonFunc;
        this.writeJsonFunc = writeJsonFunc;
    }

    private static jsonFileFromId(tenant_id: string): string {
        return `nanovdb_${tenant_id}.json`;
    }

    containTenant(tenant_id: string): boolean {
        // return this.storage.has(tenant_id) || fs.existsSync(path.join(this.storage_dir, MultiTenantNanoVDB.jsonFileFromId(tenant_id)));
        return this.storage.has(tenant_id);
    }

    private loadTenantInCache(tenant_id: string, in_memory_tenant: NanoVectorDB): void {
        if (this.storage.size >= this.max_capacity) {
            const removedTenantId = this.cacheQueue.shift();
            if (removedTenantId) {
                const vdb = this.storage.get(removedTenantId);
                if (vdb) {
                    vdb.save();
                    this.storage.delete(removedTenantId);
                }
            }
        }
        this.storage.set(tenant_id, in_memory_tenant);
        this.cacheQueue.push(tenant_id);
    }

    private loadTenant(tenant_id: string): NanoVectorDB {
        if (this.storage.has(tenant_id)) {
            return this.storage.get(tenant_id)!;
        }
        if (!this.containTenant(tenant_id)) {
            throw new Error(`Tenant ${tenant_id} not in storage`);
        }

        const tenantPath = new pathUtils().join(this.storage_dir, MultiTenantNanoVDB.jsonFileFromId(tenant_id));
        const in_memory_tenant = new NanoVectorDB({
            embedding_dim: this.embedding_dim, 
            metric: this.metric, 
            storage_file: tenantPath, 
            loadJsonFunc: this.loadJsonFunc, 
            writeJsonFunc: this.writeJsonFunc});
        this.loadTenantInCache(tenant_id, in_memory_tenant);
        return in_memory_tenant;
    }

    createTenant(tenantId?: string): string {
        const tenant_id = tenantId || uuidv4();
        const tenantPath = new pathUtils().join(this.storage_dir, MultiTenantNanoVDB.jsonFileFromId(tenant_id));
        const in_memory_tenant = new NanoVectorDB({
            embedding_dim: this.embedding_dim, 
            metric: this.metric, 
            storage_file: tenantPath, 
            loadJsonFunc: this.loadJsonFunc, 
            writeJsonFunc: this.writeJsonFunc});
        this.loadTenantInCache(tenant_id, in_memory_tenant);
        return tenant_id;
    }

    deleteTenant(tenant_id: string): void {
        if (this.storage.has(tenant_id)) {
            this.storage.delete(tenant_id);
            const index = this.cacheQueue.indexOf(tenant_id);
            if (index !== -1) {
                this.cacheQueue.splice(index, 1);
            }
        }
        const tenantPath = new pathUtils().join(this.storage_dir, MultiTenantNanoVDB.jsonFileFromId(tenant_id));
        // if (fs.existsSync(tenantPath)) {
        //     fs.unlinkSync(tenantPath);
        // }
    }

    getTenant(tenant_id: string): NanoVectorDB {
        return this.loadTenant(tenant_id);
    }

    save(): void {
        // if (!fs.existsSync(this.storage_dir)) {
        //     fs.mkdirSync(this.storage_dir, { recursive: true });
        // }
        this.storage.forEach(vdb => vdb.save());
    }
}


/**
 * 工具 utils
 */
class pathUtils {
    private system: string
    private split_str: string
    constructor(system: string = "windows") {
        this.system = system;
        if (this.system === "windows") {
            this.split_str = "\\";
        } else if (this.system === "linux") {
            this.split_str = "/";
        } else {
            this.split_str = "/";
        }
    }
    // 连接路径，保留反斜杠
    join(basePath: string, fileName: string) {
        const args = Array.prototype.slice.call(arguments);
        return [basePath, fileName].join(this.split_str).replace(new RegExp(`{${this.split_str}}`, 'g'), this.split_str);
    }
    // 获取文件的目录
    dirname(path: string) {
        const idx = path.lastIndexOf('\\');
        return (idx === -1) ? path : path.substring(0, idx);
    }
    // 获取文件的扩展名
    extname(path: string) {
        const idx = path.lastIndexOf('.');
        return (idx === -1) ? '' : path.substring(idx);
    }
    // 获取文件的名称
    basename(path: string) {
        const idx = path.lastIndexOf('\\');
        return (idx === -1) ? path : path.substring(idx + 1);
    }
};

async function loadJson(filePath: string, loadJsonFunc?: (filePath: string) => Promise<Record<string, any>>): Promise<Record<string, any>> {
    /**
     * TODO
     * 根据环境不同，需要自己实现
     * 返回的是对象
     */
    if (typeof loadJsonFunc === 'function') {
        return loadJsonFunc(filePath);
    }
    try{
        const fs = require('fs')
        //判断文件是否存在
        if (!fs.existsSync(filePath)) {
            return {}
        }
        const content = await fs.readFileSync(filePath,'utf-8');
        // console.log("content", content)
        if (!content) return {}
        return JSON.parse(content)
    }catch(e){
        console.error(e)
        return {}
    }

}




async function writeJson(jsonObject: Record<string, any>, filePath: string, writeJsonFunc?: (jsonObject: Record<string, any>, filePath: string) => Promise<void>): Promise<void> {
    /**
 * TODO
 * 根据环境不同，需要自己实现
 * 
 */
    if (typeof writeJsonFunc === 'function') {
        return writeJsonFunc(jsonObject, filePath);
    }
    try{
        const fs = require('fs')
        const jsonString = JSON.stringify(jsonObject, null, 2)
        // fs.writeFile(filePath, jsonString, (err:any) => {
        //     if (err) {
        //       console.error(err);
        //       return;
        //     }
        //     console.log('File written successfully.');
        //   });
        fs.writeFileSync(filePath, jsonString)
          
    } catch (e) {
        console.error(e)
    }
}








// module.exports = {
//     NanoVectorDB
// }
export { 
    NanoVectorDB,
    MultiTenantNanoVDB
 }