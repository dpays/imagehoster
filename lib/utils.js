"use strict";
/** Misc utils. */
Object.defineProperty(exports, "__esModule", { value: true });
const mmmagic_1 = require("mmmagic");
const magic = new mmmagic_1.Magic(mmmagic_1.MAGIC_MIME_TYPE);
/** Parse boolean value from string. */
function parseBool(input) {
    if (typeof input === 'string') {
        input = input.toLowerCase().trim();
    }
    switch (input) {
        case true:
        case 1:
        case '1':
        case 'y':
        case 'yes':
        case 'on':
            return true;
        case 0:
        case false:
        case '0':
        case 'n':
        case 'no':
        case 'off':
            return false;
        default:
            throw new Error(`Ambiguous boolean: ${input}`);
    }
}
exports.parseBool = parseBool;
/** Convert CamelCase to snake_case. */
function camelToSnake(value) {
    return value
        .replace(/([A-Z])/g, (_, m) => `_${m.toLowerCase()}`)
        .replace(/^_/, '');
}
exports.camelToSnake = camelToSnake;
/** Read stream into memory. */
function readStream(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => { chunks.push(chunk); });
        stream.on('error', reject);
        stream.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
    });
}
exports.readStream = readStream;
/** Return mimetype of data. */
function mimeMagic(data) {
    return new Promise((resolve, reject) => {
        magic.detect(data, (error, result) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(result);
            }
        });
    });
}
exports.mimeMagic = mimeMagic;
/** Async version of abstract-blob-store exists. */
function storeExists(store, key) {
    return new Promise((resolve, reject) => {
        store.exists(key, (error, exists) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(exists);
            }
        });
    });
}
exports.storeExists = storeExists;
/** Write data to store. */
function storeWrite(store, key, data) {
    return new Promise(async (resolve, reject) => {
        const stream = store.createWriteStream(key, (error, metadata) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(metadata);
            }
        });
        stream.write(data);
        stream.end();
    });
}
exports.storeWrite = storeWrite;
