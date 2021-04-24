import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { mkdtemp, readFile } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { promisify } from "util";

import { determineSystem, runNix } from "./nix";

const mkdtempAsync = promisify(mkdtemp);
const readFileAsync = promisify(readFile);

async function getRepoFlake(): Promise<string> {
  const eventData = await readFileAsync(
    process.env.GITHUB_EVENT_PATH as string
  );
  const rev = JSON.parse(eventData.toString()).after;
  return `builtins.getFlake("git+file://" + (toString ./.) + "?rev=${rev}")`;
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
    const system = await determineSystem();
    const repoFlake = await getRepoFlake();
    await exec("nix", [
      "profile",
      "install",
      "--profile",
      nixProfileDir,
      "--expr",
      `let
         repoFlake = ${repoFlake};
         pkgs = (import repoFlake.inputs.nixpkgs { system = "${system}"; });
       in ${expr}`,
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

export default main;
