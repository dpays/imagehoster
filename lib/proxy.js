"use strict";
/** Resizing image proxy. */
Object.defineProperty(exports, "__esModule", { value: true });
const config = require("config");
const crypto_1 = require("crypto");
const multihash = require("multihashes");
const needle = require("needle");
const Sharp = require("sharp");
const dist_es6_1 = require("stream-head/dist-es6");
const url_1 = require("url");
const blacklist_1 = require("./blacklist");
const common_1 = require("./common");
const error_1 = require("./error");
const utils_1 = require("./utils");
const MAX_IMAGE_SIZE = Number.parseInt(config.get('max_image_size'));
if (!Number.isFinite(MAX_IMAGE_SIZE)) {
    throw new Error('Invalid max image size');
}
const SERVICE_URL = new url_1.URL(config.get('service_url'));
/** Image types allowed to be proxied and resized. */
const AcceptedContentTypes = [
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
];
function fetchUrl(url, options) {
    return new Promise((resolve, reject) => {
        needle.get(url, options, (error, response) => {
            if (error) {
                reject(error);
            }
            else {
                resolve(response);
            }
        });
    });
}
async function proxyHandler(ctx) {
    ctx.tag({ handler: 'proxy' });
    error_1.APIError.assert(ctx.method === 'GET', error_1.APIError.Code.InvalidMethod);
    error_1.APIError.assertParams(ctx.params, ['width', 'height', 'url']);
    const width = Number.parseInt(ctx.params['width']);
    const height = Number.parseInt(ctx.params['height']);
    error_1.APIError.assert(Number.isFinite(width), 'Invalid width');
    error_1.APIError.assert(Number.isFinite(height), 'Invalid height');
    let url;
    try {
        let urlStr = ctx.request.originalUrl;
        urlStr = urlStr.slice(urlStr.indexOf('http'));
        urlStr = urlStr.replace('dsiteimages.com/ipfs/', 'ipfs.io/ipfs/');
        url = new url_1.URL(urlStr);
    }
    catch (cause) {
        throw new error_1.APIError({ cause, code: error_1.APIError.Code.InvalidProxyUrl });
    }
    // cache all proxy requests for minimum 10 minutes, including failures
    ctx.set('Cache-Control', 'public,max-age=600');
    // refuse to proxy images on blacklist
    error_1.APIError.assert(blacklist_1.imageBlacklist.includes(url.toString()) === false, error_1.APIError.Code.Blacklisted);
    // where the original image is/will be stored
    let origStore;
    let origKey;
    const origIsUpload = SERVICE_URL.origin === url.origin && url.pathname[1] === 'D';
    ctx.tag({ is_upload: origIsUpload });
    if (origIsUpload) {
        // if we are proxying or own image use the uploadStore directly
        // to avoid storing two copies of the same data
        origStore = common_1.uploadStore;
        origKey = url.pathname.slice(1).split('/')[0];
    }
    else {
        const urlHash = crypto_1.createHash('sha1')
            .update(url.toString())
            .digest();
        origStore = common_1.proxyStore;
        origKey = 'U' + multihash.toB58String(multihash.encode(urlHash, 'sha1'));
    }
    const imageKey = `${origKey}_${width}x${height}`;
    // check if we already have a converted image for requested key
    if (await utils_1.storeExists(common_1.proxyStore, imageKey)) {
        ctx.tag({ store: 'resized' });
        ctx.log.debug('streaming %s from store', imageKey);
        const file = common_1.proxyStore.createReadStream(imageKey);
        file.on('error', (error) => {
            ctx.log.error(error, 'unable to read %s', imageKey);
            ctx.res.writeHead(500, 'Internal Error');
            ctx.res.end();
            file.destroy();
        });
        const { head, stream } = await dist_es6_1.default(file, { bytes: 16384 });
        const mimeType = await utils_1.mimeMagic(head);
        ctx.set('Content-Type', mimeType);
        ctx.set('Cache-Control', 'public,max-age=29030400,immutable');
        ctx.body = stream;
        return;
    }
    // check if we have the original
    let origData;
    let contentType;
    if (await utils_1.storeExists(origStore, origKey)) {
        ctx.tag({ store: 'original' });
        origData = await utils_1.readStream(origStore.createReadStream(origKey));
        contentType = await utils_1.mimeMagic(origData);
    }
    else {
        error_1.APIError.assert(origIsUpload === false, 'Upload not found');
        ctx.tag({ store: 'fetch' });
        ctx.log.debug({ url: url.toString() }, 'fetching image');
        let res;
        try {
            res = await fetchUrl(url.toString(), {
                open_timeout: 5 * 1000,
                response_timeout: 5 * 1000,
                read_timeout: 60 * 1000,
                compressed: true,
                parse_response: false,
                follow_max: 5,
                user_agent: 'DSiteProxy/1.0 (+https://github.com/dpays/imagehoster)',
            });
        }
        catch (cause) {
            throw new error_1.APIError({ cause, code: error_1.APIError.Code.UpstreamError });
        }
        error_1.APIError.assert(res.bytes <= MAX_IMAGE_SIZE, error_1.APIError.Code.PayloadTooLarge);
        error_1.APIError.assert(Buffer.isBuffer(res.body), error_1.APIError.Code.InvalidImage);
        if (Math.floor((res.statusCode || 404) / 100) !== 2) {
            throw new error_1.APIError({ code: error_1.APIError.Code.InvalidImage });
        }
        contentType = await utils_1.mimeMagic(res.body);
        error_1.APIError.assert(AcceptedContentTypes.includes(contentType), error_1.APIError.Code.InvalidImage);
        origData = res.body;
        ctx.log.debug('storing original %s', origKey);
        await utils_1.storeWrite(origStore, origKey, origData);
    }
    let rv;
    if (contentType === 'image/gif' && width === 0 && height === 0) {
        // pass trough gif if requested with original size (0x0)
        // this is needed since resizing gifs creates still images
        rv = origData;
    }
    else {
        const image = Sharp(origData).jpeg({
            quality: 85,
            force: false,
        }).png({
            compressionLevel: 9,
            force: false,
        });
        let metadata;
        try {
            metadata = await image.metadata();
        }
        catch (cause) {
            throw new error_1.APIError({ cause, code: error_1.APIError.Code.InvalidImage });
        }
        error_1.APIError.assert(metadata.width && metadata.height, error_1.APIError.Code.InvalidImage);
        const newSize = calculateGeo(metadata.width, metadata.height, width, height);
        if (newSize.width !== metadata.width || newSize.height !== metadata.height) {
            image.resize(newSize.width, newSize.height);
        }
        rv = await image.toBuffer();
        ctx.log.debug('storing converted %s', imageKey);
        await utils_1.storeWrite(common_1.proxyStore, imageKey, rv);
    }
    ctx.set('Content-Type', contentType);
    ctx.set('Cache-Control', 'public,max-age=29030400,immutable');
    ctx.body = rv;
}
exports.proxyHandler = proxyHandler;
// from old codebase
function calculateGeo(origWidth, origHeight, targetWidth, targetHeight) {
    // Default ratio. Default crop.
    const origRatio = (origHeight !== 0 ? (origWidth / origHeight) : 1);
    // Fill in missing target dims.
    if (targetWidth === 0 && targetHeight === 0) {
        targetWidth = origWidth;
        targetHeight = origHeight;
    }
    else if (targetWidth === 0) {
        targetWidth = Math.round(targetHeight * origRatio);
    }
    else if (targetHeight === 0) {
        targetHeight = Math.round(targetWidth / origRatio);
    }
    // Constrain target dims.
    if (targetWidth > origWidth) {
        targetWidth = origWidth;
    }
    if (targetHeight > origHeight) {
        targetHeight = origHeight;
    }
    const targetRatio = targetWidth / targetHeight;
    if (targetRatio > origRatio) {
        // max out height, and calc a smaller width
        targetWidth = Math.round(targetHeight * origRatio);
    }
    else if (targetRatio < origRatio) {
        // max out width, calc a smaller height
        targetHeight = Math.round(targetWidth / origRatio);
    }
    return {
        width: targetWidth,
        height: targetHeight,
    };
}
