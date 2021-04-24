import { exec } from "@actions/exec";

export async function runNix(args: string[]): Promise<string> {
  return runCmd("nix", args);
}

async function runCmd(cmd: string, args: string[]): Promise<string> {
  let output = "";

  const options = {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString();
      },
    },
  };
  const exitCode = await exec(cmd, args, options);
  if (exitCode != 0) {
    throw `nix exited with non-zero status: ${exitCode}`;
  }

  return output;
}

export async function determineSystem(): Promise<string> {
  return runNix([
    "eval",
    "--impure",
    "--json",
    "--expr",
    "builtins.currentSystem",
  ]).then((output) => JSON.parse(output));
}
