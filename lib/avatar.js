"use strict";
/** Serve user avatars. */
Object.defineProperty(exports, "__esModule", { value: true });
const config = require("config");
const common_1 = require("./common");
const error_1 = require("./error");
const DefaultAvatar = config.get('default_avatar');
const AvatarSizes = {
    small: 64,
    medium: 128,
    large: 512,
};
async function avatarHandler(ctx) {
    ctx.tag({ handler: 'avatar' });
    error_1.APIError.assert(ctx.method === 'GET', error_1.APIError.Code.InvalidMethod);
    error_1.APIError.assertParams(ctx.params, ['username']);
    const username = ctx.params['username'];
    const size = AvatarSizes[ctx.params['size']] || AvatarSizes.medium;
    const [account] = await common_1.rpcClient.database.getAccounts([username]);
    error_1.APIError.assert(account, error_1.APIError.Code.NoSuchAccount);
    let metadata;
    try {
        metadata = JSON.parse(account.json_metadata);
    }
    catch (error) {
        ctx.log.debug(error, 'unable to parse json_metadata for %s', account.name);
        metadata = {};
    }
    let avatarUrl = DefaultAvatar;
    if (metadata.profile &&
        metadata.profile.profile_image &&
        metadata.profile.profile_image.match(/^https?:\/\//)) {
        avatarUrl = metadata.profile.profile_image;
    }
    ctx.set('Cache-Control', 'public,max-age=600');
    ctx.redirect(`/${size}x${size}/${avatarUrl}`);
}
exports.avatarHandler = avatarHandler;
