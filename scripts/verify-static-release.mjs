import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ASSET_CONTENT_TYPES = {
    css: ["text/css"],
    js: ["application/javascript", "text/javascript"],
};

const parseArguments = (values) => {
    const options = {
        attempts: 1,
        consecutive: 1,
        delayMs: 5_000,
    };

    for (let index = 0; index < values.length; index += 1) {
        const argument = values[index];

        if (!argument.startsWith("--")) {
            throw new Error(`Unexpected argument: ${argument}`);
        }

        const name = argument.slice(2);
        const value = values[index + 1];

        if (!value || value.startsWith("--")) {
            throw new Error(`Missing value for --${name}`);
        }

        options[
            name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
        ] = value;
        index += 1;
    }

    options.attempts = Number.parseInt(options.attempts, 10);
    options.consecutive = Number.parseInt(options.consecutive, 10);
    options.delayMs = Number.parseInt(options.delayMs, 10);

    if (!Number.isInteger(options.attempts) || options.attempts < 1) {
        throw new Error("--attempts must be a positive integer.");
    }

    if (
        !Number.isInteger(options.consecutive) ||
        options.consecutive < 1 ||
        options.consecutive > options.attempts
    ) {
        throw new Error(
            "--consecutive must be a positive integer no greater than --attempts.",
        );
    }

    return options;
};

const sha256 = (contents) =>
    createHash("sha256").update(contents).digest("hex");
const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const readRelease = async (releasePath) => {
    const release = JSON.parse(await readFile(releasePath, "utf8"));

    assert(
        /^[a-f0-9]{12}$/.test(release.version),
        "The release version is invalid.",
    );
    assert(
        release.commit === "local" || /^[a-f0-9]{40}$/.test(release.commit),
        "The release commit is invalid.",
    );
    assert(
        Array.isArray(release.assets) && release.assets.length > 0,
        "The release has no assets.",
    );

    for (const asset of release.assets) {
        assert(
            /^\/build\/assets\/[^?#]+\.(css|js)$/i.test(asset.path),
            `Invalid asset path: ${asset.path}`,
        );
        assert(
            asset.url === `${asset.path}?v=${release.version}`,
            `Asset URL is not tied to release ${release.version}: ${asset.url}`,
        );
        assert(
            ["css", "js"].includes(asset.type),
            `Unsupported asset type: ${asset.type}`,
        );
        assert(
            /^[a-f0-9]{64}$/.test(asset.sha256),
            `Invalid asset hash: ${asset.path}`,
        );
        assert(
            Number.isInteger(asset.bytes) && asset.bytes > 0,
            `Invalid asset size: ${asset.path}`,
        );
    }

    assert(
        release.assets.some(({ type }) => type === "css"),
        "The release has no CSS asset.",
    );
    assert(
        release.assets.some(({ type }) => type === "js"),
        "The release has no JavaScript asset.",
    );

    return release;
};

const verifyArtifact = async (artifactDirectory) => {
    const root = path.resolve(artifactDirectory);
    const release = await readRelease(path.join(root, "release.json"));
    const html = await readFile(path.join(root, "index.html"), "utf8");

    assert(
        html.includes("HATTITRIKI FC"),
        "The application marker is missing.",
    );
    assert(
        html.includes(
            `<meta name="hattitriki-release" content="${release.version}">`,
        ),
        "The HTML release marker does not match release.json.",
    );
    assert(
        !/(?:href|src)="https?:\/\/[^/"]+\/build\/assets\//.test(html),
        "An asset URL is hostname-bound.",
    );

    for (const requiredFile of [
        "_headers",
        "_redirects",
        "_worker.js",
        "boot-guard.js",
        "build/manifest.json",
        "config.js",
    ]) {
        await stat(path.join(root, requiredFile));
    }

    for (const asset of release.assets) {
        assert(
            html.includes(`="${asset.url}"`),
            `The HTML does not reference ${asset.url}.`,
        );

        const contents = await readFile(path.join(root, asset.path.slice(1)));
        assert(
            contents.byteLength === asset.bytes,
            `Size mismatch for ${asset.path}.`,
        );
        assert(
            sha256(contents) === asset.sha256,
            `SHA-256 mismatch for ${asset.path}.`,
        );
    }

    const worker = await readFile(path.join(root, "_worker.js"), "utf8");
    const headers = await readFile(path.join(root, "_headers"), "utf8");
    const redirects = await readFile(path.join(root, "_redirects"), "utf8");
    const bootGuard = await readFile(path.join(root, "boot-guard.js"), "utf8");

    assert(
        worker.includes("X-Hattitriki-Asset-Error"),
        "The asset MIME guard is missing.",
    );
    assert(
        headers.includes("/release.json"),
        "release.json is missing its no-store rule.",
    );
    assert(
        redirects.includes("/* /index.html 200"),
        "The SPA fallback is missing.",
    );
    assert(
        bootGuard.includes("asset-recovery"),
        "The browser asset recovery guard is missing.",
    );

    return release;
};

const fetchChecked = async (url, options = {}) => {
    const response = await fetch(url, {
        redirect: options.redirect || "follow",
        headers: {
            "Cache-Control": "no-cache",
            ...options.headers,
        },
        signal: AbortSignal.timeout(30_000),
    });

    return response;
};

const withSmokeNonce = (url, nonce) => {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set("smoke", nonce);

    return nextUrl.toString();
};

const verifyCanonicalRedirect = async (origin, canonicalOrigin) => {
    const nonce = `${Date.now()}-${process.pid}`;
    const source = new URL(`/rankings?smoke=${nonce}`, origin);
    const expected = new URL(`/rankings?smoke=${nonce}`, canonicalOrigin);
    const response = await fetchChecked(source, { redirect: "manual" });

    assert(
        response.status === 308,
        `${origin} returned ${response.status}; expected canonical 308.`,
    );
    assert(
        response.headers.get("location") === expected.toString(),
        `${origin} redirected to ${response.headers.get("location")}; expected ${expected}.`,
    );
};

const verifyRemoteRelease = async (origin, expectedRelease) => {
    const normalizedOrigin = new URL(origin);
    normalizedOrigin.pathname = "/";
    normalizedOrigin.search = "";
    normalizedOrigin.hash = "";

    const nonce = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`;
    const documentUrl = withSmokeNonce(normalizedOrigin, nonce);
    const documentResponse = await fetchChecked(documentUrl);
    const html = await documentResponse.text();

    assert(
        documentResponse.ok,
        `${origin} returned HTTP ${documentResponse.status}.`,
    );
    assert(
        (documentResponse.headers.get("content-type") || "")
            .toLowerCase()
            .startsWith("text/html"),
        `${origin} did not return HTML.`,
    );
    assert(
        html.includes("HATTITRIKI FC"),
        `${origin} is missing the application marker.`,
    );
    assert(
        html.includes(
            `<meta name="hattitriki-release" content="${expectedRelease.version}">`,
        ),
        `${origin} is not serving release ${expectedRelease.version}.`,
    );

    const releaseUrl = withSmokeNonce(
        new URL("/release.json", normalizedOrigin),
        nonce,
    );
    const releaseResponse = await fetchChecked(releaseUrl);
    assert(
        releaseResponse.ok,
        `${origin}/release.json returned HTTP ${releaseResponse.status}.`,
    );
    const remoteRelease = JSON.parse(await releaseResponse.text());
    assert(
        JSON.stringify(remoteRelease) === JSON.stringify(expectedRelease),
        `${origin}/release.json does not match the artifact built by CI.`,
    );

    for (const asset of expectedRelease.assets) {
        assert(
            html.includes(`="${asset.url}"`),
            `${origin} HTML does not reference ${asset.url}.`,
        );

        const assetUrl = withSmokeNonce(
            new URL(asset.url, normalizedOrigin),
            nonce,
        );
        const response = await fetchChecked(assetUrl);
        const contentType = (
            response.headers.get("content-type") || ""
        ).toLowerCase();
        const contents = Buffer.from(await response.arrayBuffer());

        assert(response.ok, `${assetUrl} returned HTTP ${response.status}.`);
        assert(
            ASSET_CONTENT_TYPES[asset.type].some((type) =>
                contentType.startsWith(type),
            ),
            `${assetUrl} returned Content-Type "${contentType || "missing"}".`,
        );
        assert(
            contents.byteLength === asset.bytes,
            `${assetUrl} has the wrong byte length.`,
        );
        assert(
            sha256(contents) === asset.sha256,
            `${assetUrl} has the wrong SHA-256.`,
        );
    }

    for (const route of ["/rankings", "/partidos"]) {
        const routeResponse = await fetchChecked(
            withSmokeNonce(new URL(route, normalizedOrigin), nonce),
        );
        const routeHtml = await routeResponse.text();

        assert(
            routeResponse.ok,
            `${origin}${route} returned HTTP ${routeResponse.status}.`,
        );
        assert(
            routeHtml.includes(
                `<meta name="hattitriki-release" content="${expectedRelease.version}">`,
            ),
            `${origin}${route} is serving a stale application shell.`,
        );
    }

    const missingAssetUrl = withSmokeNonce(
        new URL("/build/assets/hattitriki-missing.css", normalizedOrigin),
        nonce,
    );
    const missingAssetResponse = await fetchChecked(missingAssetUrl);
    const missingContentType = (
        missingAssetResponse.headers.get("content-type") || ""
    ).toLowerCase();

    assert(
        !missingAssetResponse.ok,
        `${missingAssetUrl} incorrectly returned HTTP 2xx.`,
    );
    assert(
        !missingContentType.startsWith("text/html"),
        `${missingAssetUrl} returned the SPA HTML fallback.`,
    );
    assert(
        (missingAssetResponse.headers.get("cache-control") || "").includes(
            "no-store",
        ),
        `${missingAssetUrl} is not protected against cache poisoning.`,
    );
};

const retry = async (attempts, delayMs, operation, consecutive = 1) => {
    let lastError;
    let successfulChecks = 0;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await operation();
            successfulChecks += 1;

            if (successfulChecks >= consecutive) {
                return attempt;
            }

            process.stdout.write(
                `Check ${attempt}/${attempts} passed (${successfulChecks}/${consecutive} consecutive).\n`,
            );
        } catch (error) {
            lastError = error;
            successfulChecks = 0;
            process.stderr.write(
                `Attempt ${attempt}/${attempts} failed: ${error.message}\n`,
            );
        }

        if (attempt < attempts) {
            await sleep(delayMs);
        }
    }

    throw (
        lastError ||
        new Error(
            `The deployment did not remain healthy for ${consecutive} consecutive checks.`,
        )
    );
};

const main = async () => {
    const options = parseArguments(process.argv.slice(2));

    if (options.artifact) {
        const release = await verifyArtifact(options.artifact);
        process.stdout.write(
            `Artifact ${release.version} verified byte for byte.\n`,
        );
        return;
    }

    assert(options.origin, "Use --artifact or provide --origin.");

    if (options.canonicalOrigin) {
        const attempt = await retry(
            options.attempts,
            options.delayMs,
            () =>
                verifyCanonicalRedirect(
                    options.origin,
                    options.canonicalOrigin,
                ),
            options.consecutive,
        );
        process.stdout.write(
            `Canonical redirect remained healthy through attempt ${attempt}.\n`,
        );
        return;
    }

    assert(
        options.release,
        "--release is required for a remote release check.",
    );
    const expectedRelease = await readRelease(path.resolve(options.release));
    const attempt = await retry(
        options.attempts,
        options.delayMs,
        () => verifyRemoteRelease(options.origin, expectedRelease),
        options.consecutive,
    );
    process.stdout.write(
        `${options.origin} serves release ${expectedRelease.version} exactly and remained stable through attempt ${attempt}.\n`,
    );
};

const isMainModule =
    process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
    main().catch((error) => {
        process.stderr.write(`${error.stack || error.message}\n`);
        process.exitCode = 1;
    });
}

export {
    parseArguments,
    readRelease,
    retry,
    verifyArtifact,
    verifyCanonicalRedirect,
    verifyRemoteRelease,
};
