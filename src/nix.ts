import * as core from "@actions/core";
import { getExecOutput, ExecOptions, ExecOutput } from "@actions/exec";

export async function runNix(
  args: string[],
  options?: ExecOptions
): Promise<ExecOutput> {
  switch (options) {
    case undefined:
      return getExecOutput("nix", args, { silent: !core.isDebug() });
    default:
      return getExecOutput("nix", args, options);
  }
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
