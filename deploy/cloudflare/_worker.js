const CANONICAL_HOST = 'hattitrikifc.pro';
const WWW_HOST = `www.${CANONICAL_HOST}`;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.hostname.toLowerCase() === WWW_HOST) {
            url.protocol = 'https:';
            url.hostname = CANONICAL_HOST;
            url.port = '';

            return Response.redirect(url.toString(), 308);
        }

        return env.ASSETS.fetch(request);
    },
};
