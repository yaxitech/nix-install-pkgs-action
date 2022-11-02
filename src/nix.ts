import * as core from "@actions/core";
import { getExecOutput, ExecOptions, ExecOutput } from "@actions/exec";

export async function runNix(
  args: string[],
  options?: ExecOptions
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
