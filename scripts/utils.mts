import fs from "fs/promises";

const pickFrom = (obj: Record<string, any>, keys: string[]) =>
  keys.reduce<Record<string, any>>(
    (acc, key) => ({ ...acc, [key]: obj[key] }),
    {}
  );

export const getMainPackageJson = async () =>
  JSON.stringify({
    ...pickFrom(JSON.parse((await fs.readFile("package.json")).toString()), [
      "name",
      "version",
      "author",
      "description",
      "keywords",
      "repository",
      "license",
      "bugs",
      "homepage",
      "engines",
    ]),
    publishConfig: {
      access: "public",
    },
    main: "./index.cjs",
    module: "./index.js",
    types: "./index.d.ts",
    unpkg: "./index.global.js",
    sideEffects: false,
  });
