import * as core from "@actions/core";
import { promises } from "fs";
import { tmpdir } from "os";
import * as path from "path";

import * as nix from "./nix";

async function augmentPackages(packages: string): Promise<string[]> {
  return Promise.all(
    packages
      .split(",")
      .map((str) => str.trim())
      .map(nix.maybeAddNixpkgs),
  );
}

async function installPackages(
  packages: string,
  nixProfileDir: string,
  inputsFromLockedUrl: string,
) {
  const inputsFromArgs = inputsFromLockedUrl
    ? ["--inputs-from", inputsFromLockedUrl]
    : [];

  await nix.runNix(
    [
      "profile",
      "install",
      "--profile",
      nixProfileDir,
      ...inputsFromArgs,
      ...(await augmentPackages(packages)),
    ],
    { silent: false },
  );
}

async function installExpr(
  expr: string,
  nixProfileDir: string,
  inputsFromLockedUrl: string,
  allowUnfree: boolean,
) {
  const system = await nix.determineSystem();
  const repoFlake = await nix.getRepoLockedUrl(process.cwd());
  await nix.runNix(
    [
      "profile",
      "install",
      "--profile",
      nixProfileDir,
      "--expr",
      `let
         repoFlake = builtins.getFlake("${repoFlake}");
         inputsFromFlake = builtins.getFlake("${inputsFromLockedUrl}");
         nixpkgs = ${await nix.getNixpkgs(inputsFromLockedUrl)};
         pkgs = (import nixpkgs { system = "${system}"; config.allowUnfree = ${allowUnfree}; });
       in ${expr}`,
    ],
    { silent: false },
  );
}

async function installDummyPackages(
  binaryNames: string,
  nixProfileDir: string,
  inputsFromLockedUrl: string,
) {
  const bins = binaryNames.split(",").map((b) => b.trim());
  for (const bin of bins) {
    await installExpr(
      `pkgs.writeShellScriptBin "${bin}" "echo noop"`,
      nixProfileDir,
      inputsFromLockedUrl,
      false,
    );
  }
}

async function createOrGetStateDir(): Promise<string> {
  let tmpDir = process.env.STATE_NIX_PROFILE_TMPDIR;
  // Allow to execute this action multiple times with different packages
  if (!tmpDir) {
    tmpDir = await promises.mkdtemp(
      path.join(process.env.RUNNER_TEMP || tmpdir(), "nix-profile-"),
    );
  }

  return tmpDir;
}

async function getInputsFrom(): Promise<string> {
  const inputsFrom = core.getInput("inputs-from");
  return inputsFrom && (await nix.getFlakeLockedUrl(inputsFrom));
}

export default async function main() {
  const packages = core.getInput("packages");
  const expr = core.getInput("expr");
  const dummyBins = core.getInput("dummy-bins");

  // Fail if no input is given
  if (!packages && !expr && !dummyBins) {
    throw Error(
      "Neither the `packages`, the `expr` nor the `dummy-bins` input is given",
    );
  }

  // Verify `allow-unfree` input value
  let allowUnfree = false;
  switch (core.getInput("allow-unfree")) {
    case "true":
      allowUnfree = true;
      break;
    case "false":
      allowUnfree = false;
      break;
    case "":
      allowUnfree = false;
      break;
    default:
      throw Error(
        `allow-unfree: Expected an input of either "true" or "false"`,
      );
  }

  const inputsFromLockedUrl = await getInputsFrom();

  const stateDir = await createOrGetStateDir();
  const nixProfileDir = path.join(stateDir, ".nix-profile");

  if (packages) {
    if (allowUnfree) {
      const augmentedPackages = await augmentPackages(packages);
      // nixpkgs# packages
      for (const pkg of augmentedPackages.filter((pkg) =>
        pkg.startsWith("nixpkgs#"),
      )) {
        const pkgName = pkg.replace("nixpkgs#", "");
        await installExpr(
          `pkgs.${pkgName}`,
          nixProfileDir,
          inputsFromLockedUrl,
          allowUnfree,
        );
      }
      // All other packages
      const nonNixpkgsPackages = augmentedPackages
        .filter((pkg) => !pkg.startsWith("nixpkgs#"))
        .join(",");
      if (nonNixpkgsPackages.length > 0) {
        await installPackages(
          nonNixpkgsPackages,
          nixProfileDir,
          inputsFromLockedUrl,
        );
      }
    } else {
      await installPackages(packages, nixProfileDir, inputsFromLockedUrl);
    }
  }
  if (expr) {
    await installExpr(expr, nixProfileDir, inputsFromLockedUrl, allowUnfree);
  }
  if (dummyBins) {
    await installDummyPackages(dummyBins, nixProfileDir, inputsFromLockedUrl);
  }

  core.addPath(path.join(nixProfileDir, "bin"));

  core.setOutput("nix_profile_path", nixProfileDir);

  // Export the directory to remove it in the post action of the workflow
  core.exportVariable("STATE_NIX_PROFILE_TMPDIR", stateDir);
}

main().catch((error) =>
  core.setFailed("Workflow run failed: " + error.message),
);
