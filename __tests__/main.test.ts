import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { rmRF } from "@actions/io";
import * as fs from "fs";
import * as path from "path";
import { mocked } from "jest-mock";

import main from "../src/main";

jest.mock("@actions/core");
jest.mock("@actions/exec");

afterEach(() => {
  jest.clearAllMocks();
  jest.resetAllMocks();
});

test("fails with no inputs", async () => {
  jest.spyOn(core, "getInput").mockImplementation((name, options?) => {
    return "";
  });

  await expect(main()).rejects.toThrow(
    "Neither the `packages` nor the `expr` input is given"
  );
});

test("fails for invalid flake reference", async () => {
  jest.spyOn(core, "getInput").mockImplementation((name, options?) => {
    switch (name) {
      case "packages":
        return "wurzel:pfropf";
      default:
        throw Error("Should not reach here");
    }
  });

  jest
    .spyOn(exec, "getExecOutput")
    .mockImplementation((commandLine, args?: string[], options?) => {
      const res = {
        exitCode: 1,
        stderr: `error: input 'wurzel:pfropf' is unsupported`,
      } as exec.ExecOutput;
      return Promise.resolve(res);
    });

  await expect(main()).rejects.toThrow(
    `Given flake reference "wurzel:pfropf" is invalid: error: input 'wurzel:pfropf' is unsupported`
  );
});

test("installs packages into profile", async () => {
  jest.spyOn(core, "getInput").mockImplementation((name, options?) => {
    switch (name) {
      case "packages":
        return "package1,nixpkgs#package2,github:yaxitech/ragenix";
      default:
        return "";
    }
  });

  jest
    .spyOn(exec, "getExecOutput")
    .mockImplementation((commandLine, args?: string[], options?) => {
      const pkg = args?.slice(-1)[0];
      const res = {} as exec.ExecOutput;
      switch (pkg) {
        case "package1":
          res.exitCode = 1;
          res.stderr = `error: cannot find flake 'flake:${pkg}' in the flake registries`;
          break;
        default:
          res.exitCode = 0;
          break;
      }
      return Promise.resolve(res);
    });

  await main();

  const nixProfileDir = await getAndDeleteCreatedProfileDir();
  expect(exec.exec).toBeCalledWith("nix", [
    "profile",
    "install",
    "--profile",
    nixProfileDir,
    "nixpkgs#package1",
    "nixpkgs#package2",
    "github:yaxitech/ragenix",
  ]);
  expect(exec.exec).toHaveBeenCalledTimes(1);
  expect(core.addPath).toHaveBeenCalledWith(path.join(nixProfileDir, "bin"));
});

test("installs expr into profile", async () => {
  jest.spyOn(core, "getInput").mockImplementation((name, options?) => {
    switch (name) {
      case "expr":
        return "pkgs.wurzelpfropf";
      default:
        return "";
    }
  });

  jest.spyOn(exec, "exec").mockImplementation(async (cmd, args, options) => {
    if (args && args[args.length - 1] === "builtins.currentSystem") {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from('"i686-linux"'));
      }
    }
    return 0;
  });

  process.env.GITHUB_EVENT_PATH = path.join(
    __dirname,
    "fixtures",
    "push_event.json"
  );

  await main();

  const nixProfileDir = await getAndDeleteCreatedProfileDir();
  const cwd = path.resolve(process.cwd());
  expect(exec.exec).toBeCalledWith("nix", [
    "profile",
    "install",
    "--profile",
    nixProfileDir,
    "--expr",
    `let
         repoFlake = builtins.getFlake("git+file://${cwd}?rev=0000000000000000000000000000000000000000");
         pkgs = (import repoFlake.inputs.nixpkgs { system = "i686-linux"; });
       in pkgs.wurzelpfropf`,
  ]);
  // `determineSystem` + `nix profile install --expr`
  expect(exec.exec).toHaveBeenCalledTimes(2);
  expect(core.addPath).toHaveBeenCalledWith(path.join(nixProfileDir, "bin"));
});

test("installs packages and expr into profile", async () => {
  jest.spyOn(core, "getInput").mockImplementation((name, options?) => {
    switch (name) {
      case "expr":
        return "pkgs.wurzelpfropf";
      case "packages":
        return "wuffmiau";
      default:
        throw Error("Should not reach here");
    }
  });

  jest
    .spyOn(exec, "getExecOutput")
    .mockImplementation((commandLine, args?: string[], options?) => {
      const res = {} as exec.ExecOutput;
      res.exitCode = 1;
      res.stderr = `error: cannot find flake 'flake:wuffmiau' in the flake registries`;
      return Promise.resolve(res);
    });

  jest.spyOn(exec, "exec").mockImplementation(async (cmd, args, options) => {
    if (args && args[args.length - 1] === "builtins.currentSystem") {
      if (options?.listeners?.stdout) {
        options.listeners.stdout(Buffer.from('"i686-linux"'));
      }
    }
    return 0;
  });

  process.env.GITHUB_EVENT_PATH = path.join(
    __dirname,
    "fixtures",
    "push_event.json"
  );

  await main();

  const nixProfileDir = await getAndDeleteCreatedProfileDir();

  // `packages` input
  expect(exec.exec).toBeCalledWith("nix", [
    "profile",
    "install",
    "--profile",
    nixProfileDir,
    "nixpkgs#wuffmiau",
  ]);

  // `expr` input
  const cwd = path.resolve(process.cwd());
  expect(exec.exec).toBeCalledWith("nix", [
    "profile",
    "install",
    "--profile",
    nixProfileDir,
    "--expr",
    `let
         repoFlake = builtins.getFlake("git+file://${cwd}?rev=0000000000000000000000000000000000000000");
         pkgs = (import repoFlake.inputs.nixpkgs { system = "i686-linux"; });
       in pkgs.wurzelpfropf`,
  ]);
  // `determineSystem` + `nix profile install --expr`
  expect(exec.exec).toHaveBeenCalledTimes(3);
  expect(core.addPath).toHaveBeenCalledWith(path.join(nixProfileDir, "bin"));
});

async function getAndDeleteCreatedProfileDir(): Promise<string> {
  expect(mocked(core.exportVariable).mock.calls[0][0]).toEqual(
    "STATE_NIX_PROFILE_TMPDIR"
  );
  const tmpDir = mocked(core.exportVariable).mock.calls[0][1];
  await rmRF(tmpDir);
  return path.join(tmpDir, ".nix-profile");
}
