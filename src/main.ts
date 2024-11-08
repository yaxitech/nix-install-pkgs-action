import * as core from "@actions/core";
import { promises } from "fs";
import { tmpdir } from "os";
import * as path from "path";

import * as nix from "./nix";

async function installPackages(
  nixProfileDir: string,
  inputsFromLockedUrl: string,
) {
  // Install given `packages`, if any
  const packages = core.getInput("packages");
  if (packages) {
    const augumentedPackages = await Promise.all(
      packages
        .split(",")
        .map((str) => str.trim())
        .map(nix.maybeAddNixpkgs),
    );

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
        ...augumentedPackages,
      ],
      { silent: false },
    );
  }
}

async function installExpr(nixProfileDir: string, inputsFromLockedUrl: string) {
  const expr = core.getInput("expr");
  if (expr) {
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
         pkgs = (import nixpkgs { system = "${system}"; });
       in ${expr}`,
      ],
      { silent: false },
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
  // Fail if no input is given
  if (!core.getInput("packages") && !core.getInput("expr")) {
    throw Error("Neither the `packages` nor the `expr` input is given");
  }

  const inputsFromLockedUrl = await getInputsFrom();

  const stateDir = await createOrGetStateDir();
  const nixProfileDir = path.join(stateDir, ".nix-profile");

  await installPackages(nixProfileDir, inputsFromLockedUrl);
  await installExpr(nixProfileDir, inputsFromLockedUrl);

  core.addPath(path.join(nixProfileDir, "bin"));

  core.setOutput("nix_profile_path", nixProfileDir);

  // Export the directory to remove it in the post action of the workflow
  core.exportVariable("STATE_NIX_PROFILE_TMPDIR", stateDir);
}

main().catch((error) =>
  core.setFailed("Workflow run failed: " + error.message),
);
