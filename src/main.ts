import * as core from "@actions/core";
import { promises } from "fs";
import { tmpdir } from "os";
import * as path from "path";

import { determineSystem, runNix, maybeAddNixpkgs } from "./nix";

async function getRepoFlake(): Promise<string> {
  // Assumes that the CWD is the checked out flake's root
  const cwd = path.resolve(process.cwd());
  const flakeUrl = new URL("git+file://" + cwd);

  // Check if this is a shallow clone by probing if `.git/shallow` exists.
  // If yes, read the revision from the file.
  const shallowRev: string | undefined = await promises
    .readFile(path.join(cwd, ".git", "shallow"))
    .then((buf) => buf.toString().trim())
    .catch(() => undefined);

  if (shallowRev) {
    flakeUrl.searchParams.append("rev", shallowRev);
    flakeUrl.searchParams.append("shallow", "1");
  } else {
    // If this is not a shallow clone, read the revision from the GitHub
    // event data.
    const eventData = await promises
      .readFile(process.env.GITHUB_EVENT_PATH as string)
      .then((buf) => buf.toString())
      .then(JSON.parse);
    const eventType = process.env.GITHUB_EVENT_NAME as string;
    const rev =
      eventType === "pull_request"
        ? eventData.pull_request.head.sha
        : eventData.after;
    flakeUrl.searchParams.append("rev", rev);
  }

  return `builtins.getFlake("${flakeUrl}")`;
}

async function main() {
  // Fail if no input is given
  if (!core.getInput("packages") && !core.getInput("expr")) {
    throw Error("Neither the `packages` nor the `expr` input is given");
  }

  let tmpDir = process.env.STATE_NIX_PROFILE_TMPDIR;
  // Allow to execute this action multiple times with different packages
  if (!tmpDir) {
    tmpDir = await promises.mkdtemp(path.join(tmpdir(), "nix-profile-"));
  }

  const nixProfileDir = path.join(tmpDir, ".nix-profile");

  // Install given `packages`, if any
  const packages = core.getInput("packages");
  if (packages) {
    const augumentedPackages = await Promise.all(
      packages
        .split(",")
        .map((str) => str.trim())
        .map(maybeAddNixpkgs)
    );

    await runNix([
      "profile",
      "install",
      "--profile",
      nixProfileDir,
      ...augumentedPackages,
    ]);
  }

  // Evaluate `expr` and install, if given
  const expr = core.getInput("expr");
  if (expr) {
    const system = await determineSystem();
    const repoFlake = await getRepoFlake();
    await runNix([
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
