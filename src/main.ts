import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { mkdtemp } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { promisify } from "util";

const mkdtempAsync = promisify(mkdtemp);

async function runNix(args: string[]): Promise<string> {
  let output = "";

  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
  };
  const exitCode = await exec("nix", args, options);
  if (exitCode != 0) {
    throw "nix exited with non-zeror exit status: ${exitCode}";
  }

  return output;
}

async function determineNixpkgsExprFromFlake() {
  const flake = JSON.parse(await runNix(["flake", "metadata", "--json"]));
  const nixpkgs = flake.locks?.nodes?.nixpkgs?.locked;
  if (!nixpkgs) {
    throw "Could not find nixpkgs input. You need to provide a (locked) input called nixpkgs.";
  }
  const flakeRef = `github:${nixpkgs.owner}/${nixpkgs.repo}/${nixpkgs.rev}`;
  const system = await runNix([
    "eval",
    "--impure",
    "--expr",
    "builtins.currentSystem",
  ]);
  return `(import (builtins.getFlake("${flakeRef}")) { system = ${system}; })`;
}

function maybeAddNixpkgs(pkg: string) {
  if (pkg.indexOf("#") < 0) {
    return "nixpkgs#" + pkg;
  } else {
    return pkg;
  }
}

async function main() {
  let tmpDir = process.env.STATE_NIX_PROFILE_TMPDIR;
  // Allow to execute this action multiple times with different packages
  if (!tmpDir) {
    tmpDir = await mkdtempAsync(path.join(tmpdir(), "nix-profile-"));
  }

  const nixProfileDir = path.join(tmpDir, ".nix-profile");

  const packages: string[] = core
    .getInput("packages")
    .split(",")
    .map((str) => str.trim())
    .map(maybeAddNixpkgs);

  const expr = core.getInput("expr");
  if (expr) {
    const nixpkgs = await determineNixpkgsExprFromFlake();
    await exec("nix", [
      "profile",
      "install",
      "--profile",
      nixProfileDir,
      "--expr",
      `let pkgs = ${nixpkgs}; in ${expr}`,
    ]);
  } else {
    await exec("nix", [
      "profile",
      "install",
      "--profile",
      nixProfileDir,
      ...packages,
    ]);
  }

  core.addPath(path.join(nixProfileDir, "bin"));

  // Export the temporary directory to remove it in the post action of the
  // workflow
  core.exportVariable("STATE_NIX_PROFILE_TMPDIR", tmpDir);
}

main().catch((error) =>
  core.setFailed("Workflow run failed: " + error.message)
);
