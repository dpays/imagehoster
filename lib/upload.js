"use strict";
/** Uploads file to blob store. */
Object.defineProperty(exports, "__esModule", { value: true });
const Busboy = require("busboy");
const config = require("config");
const crypto_1 = require("crypto");
const dpayts_1 = require("dpayts");
const multihash = require("multihashes");
const RateLimiter = require("ratelimiter");
const url_1 = require("url");
const blacklist_1 = require("./blacklist");
const common_1 = require("./common");
const error_1 = require("./error");
const utils_1 = require("./utils");
const SERVICE_URL = new url_1.URL(config.get('service_url'));
const MAX_IMAGE_SIZE = Number.parseInt(config.get('max_image_size'));
if (!Number.isFinite(MAX_IMAGE_SIZE)) {
    throw new Error('Invalid max image size');
}
const UPLOAD_LIMITS = config.get('upload_limits');
if (new url_1.URL('http://blä.se').toString() !== 'http://xn--bl-wia.se/') {
    throw new Error('Incompatible node.js version, must be compiled with ICU support');
}
/**
 * Parse multi-part request and return first file found.
 */
async function parseMultipart(request) {
    return new Promise((resolve, reject) => {
        const form = new Busboy({
            headers: request.headers,
            limits: {
                files: 1,
                fileSize: MAX_IMAGE_SIZE,
            }
        });
        form.on('file', (field, stream, name, encoding, mime) => {
            resolve({ stream, mime, name });
        });
        form.on('error', reject);
        form.on('finish', () => {
            reject(new error_1.APIError({ code: error_1.APIError.Code.FileMissing }));
        });
        request.pipe(form);
    });
}
/**
 * Get ratelimit info for account name.
 */
async function getRatelimit(account) {
    return new Promise((resolve, reject) => {
        if (!common_1.redisClient) {
            throw new Error('Redis not configured');
        }
        const limit = new RateLimiter({
            db: common_1.redisClient,
            duration: UPLOAD_LIMITS.duration,
            id: account,
            max: UPLOAD_LIMITS.max,
        });
        limit.get((error, result) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(result);
            }
        });
    });
}
async function uploadHandler(ctx) {
    ctx.tag({ handler: 'upload' });
    error_1.APIError.assert(ctx.method === 'POST', { code: error_1.APIError.Code.InvalidMethod });
    error_1.APIError.assertParams(ctx.params, ['username', 'signature']);
    let signature;
    try {
        signature = dpayts_1.Signature.fromString(ctx.params['signature']);
    }
    catch (cause) {
        throw new error_1.APIError({ code: error_1.APIError.Code.InvalidSignature, cause });
    }
    error_1.APIError.assert(ctx.get('content-type').includes('multipart/form-data'), { message: 'Only multipart uploads are supported' });
    const contentLength = Number.parseInt(ctx.get('content-length'));
    error_1.APIError.assert(Number.isFinite(contentLength), error_1.APIError.Code.LengthRequired);
    error_1.APIError.assert(contentLength <= MAX_IMAGE_SIZE, error_1.APIError.Code.PayloadTooLarge);
    const file = await parseMultipart(ctx.req);
    const data = await utils_1.readStream(file.stream);
    // extra check if client manges to lie about the content-length
    error_1.APIError.assert(file.stream.truncated !== true, error_1.APIError.Code.PayloadTooLarge);
    const imageHash = crypto_1.createHash('sha256')
        .update('ImageSigningChallenge')
        .update(data)
        .digest();
    const [account] = await common_1.rpcClient.database.getAccounts([ctx.params['username']]);
    error_1.APIError.assert(account, error_1.APIError.Code.NoSuchAccount);
    let validSignature = false;
    const publicKey = signature.recover(imageHash).toString();
    const threshold = account.posting.weight_threshold;
    for (const auth of account.posting.key_auths) {
        if (auth[0] === publicKey && auth[1] >= threshold) {
            validSignature = true;
            break;
        }
    }
    error_1.APIError.assert(validSignature, error_1.APIError.Code.InvalidSignature);
    error_1.APIError.assert(!blacklist_1.accountBlacklist.includes(account.name), error_1.APIError.Code.Blacklisted);
    let limit = { total: 0, remaining: Infinity, reset: 0 };
    try {
        limit = await getRatelimit(account.name);
    }
    catch (error) {
        ctx.log.warn(error, 'unable to enforce upload rate limits');
    }
    error_1.APIError.assert(limit.remaining > 0, error_1.APIError.Code.QoutaExceeded);
    error_1.APIError.assert(repLog10(account.reputation) >= UPLOAD_LIMITS.reputation, error_1.APIError.Code.Deplorable);
    const key = 'D' + multihash.toB58String(multihash.encode(imageHash, 'sha2-256'));
    const url = new url_1.URL(`${key}/${file.name}`, SERVICE_URL);
    if (!(await utils_1.storeExists(common_1.uploadStore, key))) {
        await utils_1.storeWrite(common_1.uploadStore, key, data);
    }
    else {
        ctx.log.debug('key %s already exists in store', key);
    }
    ctx.log.info({ uploader: account.name, size: data.byteLength }, 'image uploaded');
    ctx.status = 200;
    ctx.body = { url };
}
exports.uploadHandler = uploadHandler;
/**
 * Calculate reputation for user, from old codebase.
 * HERE BE DRAGONS
 */
function repLog10(rep2) {
    if (rep2 == null) {
        return rep2;
    } // tslint:disable-line:triple-equals
    let rep = String(rep2);
    const neg = rep.charAt(0) === '-';
    rep = neg ? rep.substring(1) : rep;
    let out = log10(rep);
    if (isNaN(out)) {
        out = 0;
    }
    out = Math.max(out - 9, 0); // @ -9, $0.50 earned is approx magnitude 1
    out = (neg ? -1 : 1) * out;
    out = (out * 9) + 25; // 9 points per magnitude. center at 25
    // base-line 0 to darken and < 0 to auto hide (grep rephide)
    out = parseInt(out + ''); // tslint:disable-line:radix
    return out;
}
/**
 * This is a rough approximation of log10 that works with huge digit-strings.
 * Warning: Math.log10(0) === NaN
 */
function log10(str) {
    const leadingDigits = parseInt(str.substring(0, 4)); // tslint:disable-line:radix
    const log = Math.log(leadingDigits) / Math.log(10);
    const n = str.length - 1;
    return n + (log - parseInt(log + '')); // tslint:disable-line:radix
}
