import glob from "fast-glob";
import esbuild from "esbuild";
import jsxRuntime from "@uppercod/esbuild-jsx-runtime";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { getValueIndentation } from "@uppercod/indentation";
import { pluginExternals } from "./plugin-externals.js";
import pluginMetaUrl from "@uppercod/esbuild-meta-url";

const pexec = promisify(exec);

const assets = [
    "jpg",
    "svg",
    "png",
    "gif",
    "mp4",
    "webp",
    "jpeg",
    "ico",
    "mp3",
    "eot",
    "woff2",
    "woff",
    "ttf",
    "pdf",
    "ogg",
    "ogv",
    "ogm",
    "md",
];

function logger(message) {
    const date = new Date();
    const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
        .map((value) => (value > 9 ? value : "0" + value))
        .join(":");
    console.log(`[${time}] ${message}`);
}

/**
 * @param {object} config
 * @param {string} config.src
 * @param {string} config.dest
 * @param {boolean} [config.types]
 * @param {boolean} [config.minify]
 * @param {boolean} [config.watch]
 * @param {boolean} [config.exports]
 * @param {boolean} [config.sourcemap]
 * @param {boolean} [config.format]
 * @param {string} [config.workspace]
 * @param {string[]} [config.target]
 * @param {string[]} [config.metaUrl]
 * @param {(config:import("esbuild").BuildOptions)=>import("esbuild").BuildOptions} [config.preload]
 * @returns
 */
export async function prepare(config) {
    console.log("\nPKG.NAME");
    logger("Initializing...");
    //@ts-ignore
    const entryPoints = await glob(config.src);
    const pkgRootSrc = process.cwd() + "/package.json";
    const [pkg, pkgText] = await getJson(pkgRootSrc);

    const external = getExternal(pkg);

    if (config.workspace) {
        (
            await Promise.all(
                (await glob(config.workspace)).map((file) => getJson(file))
            )
        ).forEach(([pkg]) => getExternal(pkg, external));
    }

    const metaUrl = (config.metaUrl || [])
        .concat(assets)
        .reduce((metaUrl, key) => {
            metaUrl[key] = true;
            return metaUrl;
        }, {});

    if (!entryPoints.length) {
        return logger("No file input!");
    } else {
        logger("Generating outputs with esbuild...");
    }

    const externalKeys = Object.keys(external);
    /**
     * @type {import("esbuild").BuildOptions}
     */
    const build = {
        entryPoints,
        outdir: config.dest,
        jsxFactory: "_jsx",
        sourcemap: config.sourcemap,
        metafile: true,
        minify: config.minify,
        bundle: true,
        format: config.format || "esm",
        splitting: true,
        external: externalKeys,
        watch: config.watch
            ? {
                  onRebuild(error) {
                      logger(
                          error
                              ? "watch build failed:"
                              : "waiting for changes..."
                      );
                  },
              }
            : null,
        loader: metaUrl.css ? {} : { ".css": "text" },
        plugins: [
            pluginMetaUrl(metaUrl),
            jsxRuntime(),
            pluginExternals(externalKeys),
        ],
    };

    if (config.target) build.target = config.target;

    const { metafile } = await esbuild.build(
        config.preload ? config.preload(build) : build
    );

    logger("Esbuild completed...");

    if (config.watch) {
        logger("waiting for changes...");
    } else {
        if (config.exports || config.workspace) {
            config.exports && setPkgExports(pkg, metafile);
            config.workspace && setPkgDependencies(pkg);

            logger("Preparing package.json...");

            const [, space] = pkgText.match(/^(\s+)"/m);

            await writeFile(
                pkgRootSrc,
                JSON.stringify(
                    pkg,
                    null,
                    getValueIndentation(space) / getValueIndentation(" ")
                )
            );

            logger("Finished package.json!");
        }

        if (config.types) {
            logger("Preparing types...");

            await generateTypes(entryPoints);

            logger("Finished types!");
        }

        logger("completed!");
    }
}

/**
 * Read a json document
 * @param {string} file
 * @returns {Promise<{[prop:string]:any}>}
 */
async function getJson(file) {
    const text = await readFile(file, "utf-8");
    return [JSON.parse(text), text];
}

/**
 * Get external files not to be included in the build
 * @param {{[prop:string]:any}} pkg
 * @param {{[prop:string]:Set<string>}} external
 * @returns {{[prop:string]:Set<string>}}
 */
function getExternal(pkg, external = {}) {
    const { dependencies } = pkg;
    for (const prop in dependencies) {
        external[prop] = external[prop] || new Set();
        external[prop].add(dependencies[prop]);
    }
    return external;
}

function setPkgDependencies(pkg, external) {
    const { dependencies = {} } = pkg;
    for (const prop in external) {
        if (!dependencies[prop]) {
            const [first] = [...external[prop]];
            dependencies[prop] = first;
        }
    }
    pkg.dependencies = dependencies;
}
/**
 * @param {object} pkg
 * @param {import("esbuild").Metafile} metafile
 */
async function setPkgExports(pkg, metafile) {
    pkg.exports = Object.entries(metafile.outputs)
        .filter(([, { entryPoint = "" }]) => /\.[jt]s[x]*$/.test(entryPoint))
        .reduce(
            (exports, [output]) => ({
                ...exports,
                ["./" + path.parse(output).name]: "./" + output,
            }),
            {
                ...pkg.exports,
            }
        );
}
/**
 *
 * @param {string[]} entryPoints
 */
async function generateTypes(entryPoints) {
    const serialieCommand = Object.entries({
        strict: true,
        jsx: "react-jsx",
        jsxImportSource: "atomico",
        allowJs: true,
        declaration: true,
        emitDeclarationOnly: true,
        outDir: "./",
        lib: ["ESNext", "DOM", "DOM.Iterable"],
    }).reduce(
        (command, [index, value]) => command + ` --${index} ${value}`,
        ""
    );

    await pexec(`npx tsc ${entryPoints.join(" ")} ${serialieCommand}`);
}
