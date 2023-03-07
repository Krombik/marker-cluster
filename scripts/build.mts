import { build } from "tsup";
import fs from "fs/promises";
import { FILES_TO_COPY } from "./constants.mjs";
import { getMainPackageJson } from "./utils.mjs";

const run = async (outDir: string) => {
  await fs.rm(outDir, { recursive: true, force: true });

  await build({
    outDir,
    minify: false,
    entry: ["src/index.ts"],
    splitting: true,
    sourcemap: true,
    clean: false,
    target: "es2020",
    treeshake: { preset: "smallest" },
    dts: true,
    format: ["cjs", "esm"],
    platform: "browser",
  });

  await build({
    outDir,
    minify: true,
    entry: ["src/index.ts"],
    sourcemap: false,
    clean: false,
    target: "es5",
    treeshake: { preset: "smallest" },
    dts: false,
    format: "iife",
    platform: "browser",
    globalName: "MarkerCluster",
  });

  await fs.writeFile(`${outDir}/package.json`, await getMainPackageJson());

  for (let i = 0; i < FILES_TO_COPY.length; i++) {
    const fileName = FILES_TO_COPY[i];

    await fs.copyFile(fileName, `${outDir}/${fileName}`);
  }
};

run("build");
