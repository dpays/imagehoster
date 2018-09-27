"use strict";
/** API routes. */
Object.defineProperty(exports, "__esModule", { value: true });
const Router = require("koa-router");
const avatar_1 = require("./avatar");
const proxy_1 = require("./proxy");
const serve_1 = require("./serve");
const upload_1 = require("./upload");
const version = require('./version');
const router = new Router();
async function healthcheck(ctx) {
    const ok = true;
    const date = new Date();
    ctx.body = { ok, version, date };
}
router.get('/', healthcheck);
router.get('/.well-known/healthcheck.json', healthcheck);
router.get('/u/:username/avatar/:size?', avatar_1.avatarHandler);
router.post('/:username/:signature', upload_1.uploadHandler);
router.get('/:width(\\d+)x:height(\\d+)/:url(.*)', proxy_1.proxyHandler);
router.get('/:hash/:filename?', serve_1.serveHandler);
exports.routes = router.routes();
