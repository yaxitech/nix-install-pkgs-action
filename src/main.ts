import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { promises, constants } from "fs";
import { tmpdir } from "os";
import * as path from "path";

import { determineSystem } from "./nix";

async function getRepoFlake(): Promise<string> {
  // Assumes that the CWD is the checked out flake's root
  const cwd = path.resolve(process.cwd());
  const flakeUrl = new URL("git+file://" + cwd);

  // Check if this is a shallow clone. When using `builtins.getFlake`,
  // we have to inform Nix about a shallow clone explicitly.
  await promises
    .access(path.join(cwd, ".git", "shallow"), constants.F_OK)
    .then(() => flakeUrl.searchParams.append("shallow", "1"))
    .catch(() => {
      /* ignored */
    });

  // Add the revision to the flake URL
  await promises
    .readFile(process.env.GITHUB_EVENT_PATH as string)
    .then((buf) => buf.toString())
    .then(JSON.parse)
    .then((eventData) => eventData.after)
    .then((rev) => flakeUrl.searchParams.append("rev", rev));

  return `builtins.getFlake("${flakeUrl}")`;
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
    tmpDir = await promises.mkdtemp(path.join(tmpdir(), "nix-profile-"));
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
