import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { mkdtemp } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { promisify } from "util";

const mkdtempAsync = promisify(mkdtemp);

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

  await exec("nix", [
    "profile",
    "install",
    "--profile",
    nixProfileDir,
    ...packages,
  ]);

  core.addPath(path.join(nixProfileDir, "bin"));

  // Export the temporary directory to remove it in the post action of the
  // workflow
  core.exportVariable("STATE_NIX_PROFILE_TMPDIR", tmpDir);
}

main().catch((error) =>
  core.setFailed("Workflow run failed: " + error.message)
);
