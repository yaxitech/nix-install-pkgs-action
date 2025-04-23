import * as core from "@actions/core";
import { getExecOutput, ExecOptions, ExecOutput } from "@actions/exec";

export async function runNix(
  args: string[],
  options?: ExecOptions,
): Promise<ExecOutput> {
  return getExecOutput("nix", args, { silent: !core.isDebug(), ...options });
}

export async function determineSystem(): Promise<string> {
  return runNix([
    "eval",
    "--impure",
    "--json",
    "--expr",
    "builtins.currentSystem",
  ]).then((res) => JSON.parse(res.stdout));
}

export async function maybeAddNixpkgs(pkg: string): Promise<string> {
  if (pkg.includes("#")) {
    return pkg;
  }

  const res = await runNix(["flake", "metadata", pkg], {
    ignoreReturnCode: true,
    silent: !core.isDebug(),
  });

  if (res.exitCode == 0) {
    return pkg;
  } else if (res.stderr.includes(`cannot find`)) {
    core.info(`Prefixing "${pkg}" with "nixpkgs#"`);
    return `nixpkgs#${pkg}`;
  } else {
    throw Error(`Given flake reference "${pkg}" is invalid: ${res.stderr}"`);
  }
}

async function buildLockedUrl(metadata: any) {
  const url = new URL(`path:${metadata.path}`);
  url.searchParams.append("narHash", metadata.locked.narHash);
  return url.toString();
}

export async function getRepoLockedUrl(path: string): Promise<string> {
  const res = await runNix(["flake", "metadata", "--json", path], {
    ignoreReturnCode: true,
  });

  switch (res.exitCode) {
    case 0:
      return buildLockedUrl(JSON.parse(res.stdout));
    default:
      return "";
  }
}

export async function getFlakeLockedUrl(flakeRef: string): Promise<string> {
  return runNix(["flake", "metadata", "--json", flakeRef])
    .then((res) => JSON.parse(res.stdout))
    .then(buildLockedUrl);
}

export async function getNixpkgs(
  inputsFromLockedUrl?: string,
): Promise<string> {
  if (inputsFromLockedUrl) {
    return `(builtins.getFlake("${inputsFromLockedUrl}")).inputs.nixpkgs`;
  } else {
    return getFlakeLockedUrl("nixpkgs").then(
      (url) => `builtins.getFlake("${url}")`,
    );
  }
}
