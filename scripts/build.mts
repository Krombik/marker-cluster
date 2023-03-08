import { build } from "tsup";
import fs from "fs/promises";
import ts from "typescript";
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
    dts: false,
    format: ["cjs", "esm"],
    platform: "browser",
  });

  if (
    ts
      .createProgram(["src/index.ts"], {
        emitDeclarationOnly: true,
        declaration: true,
        stripInternal: true,
        outDir,
      })
      .emit().emitSkipped
  ) {
    throw new Error("TypeScript compilation failed");
  }

  const children = await fs.readdir(outDir);

  for (let i = 0; i < children.length; i++) {
    const path = `${outDir}/${children[i]}`;

    if (
      path.endsWith(".d.ts") &&
      (await fs.readFile(path)).toString() === "export {};\n"
    ) {
      await fs.rm(path);
    }
  }

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
