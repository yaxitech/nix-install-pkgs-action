import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { rmRF } from "@actions/io";
import path from "path";
import { mocked } from "jest-mock";

import main from "../src/main";
import * as nix from "../src/nix";

jest.mock("@actions/core");
jest.mock("@actions/exec");
jest.mock("../src/nix");

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

test("installs packages into profile", async () => {
  jest.spyOn(core, "getInput").mockImplementation((name, options?) => {
    switch (name) {
      case "packages":
        return "nixpkgs#package1,nixpkgs#package2,github:yaxitech/ragenix";
      default:
        return "";
    }
  });

  jest.spyOn(nix, "maybeAddNixpkgs").mockImplementation(async (pkg) => pkg);

  jest.spyOn(nix, "runNix").mockImplementation(async (args, options?) => {
    return Promise.resolve({} as exec.ExecOutput);
  });

  await main();

  const nixProfileDir = await getAndDeleteCreatedProfileDir();
  expect(nix.runNix).toBeCalledWith([
    "profile",
    "install",
    "--profile",
    nixProfileDir,
    "nixpkgs#package1",
    "nixpkgs#package2",
    "github:yaxitech/ragenix",
  ]);

  expect(nix.maybeAddNixpkgs).toHaveBeenCalledTimes(3);
  expect(nix.runNix).toHaveBeenCalledTimes(1);
  expect(core.addPath).toHaveBeenCalledWith(path.join(nixProfileDir, "bin"));
});

test("installs expr into profile without inputs-from", async () => {
  jest.spyOn(core, "getInput").mockImplementation((name, options?) => {
    switch (name) {
      case "expr":
        return "pkgs.wurzelpfropf";
      case "packages":
      case "inputs-from":
      default:
        return "";
    }
  });

  jest
    .spyOn(nix, "determineSystem")
    .mockImplementation(async () => "i686-linux");

  jest.spyOn(nix, "getRepoLockedUrl").mockImplementation(async (_path) => {
    expect(_path).toBe(path.resolve(process.cwd()));
    return "file:///nix/store/nyr21fwgx0wzf1j94hd42icc7ffvh8jr-source?narHash=sha256-I4cKCEg3yeO0G4wuA/ohOJPdM2ag1FtqnhwEdsC8PDk=";
  });

  jest
    .spyOn(nix, "getNixpkgs")
    .mockImplementation(async (inputsFromLockedUrl) => {
      expect(inputsFromLockedUrl).toBe("");
      return `builtins.getFlake("git+https://yaxi.tech?narHash=sha256-abcdef")`;
    });

  await main();

  const nixProfileDir = await getAndDeleteCreatedProfileDir();
  expect(nix.runNix).toBeCalledWith([
    "profile",
    "install",
    "--profile",
    nixProfileDir,
    "--expr",
    `let
         repoFlake = builtins.getFlake("file:///nix/store/nyr21fwgx0wzf1j94hd42icc7ffvh8jr-source?narHash=sha256-I4cKCEg3yeO0G4wuA/ohOJPdM2ag1FtqnhwEdsC8PDk=");
         inputsFromFlake = builtins.getFlake("");
         nixpkgs = builtins.getFlake("git+https://yaxi.tech?narHash=sha256-abcdef");
         pkgs = (import nixpkgs { system = "i686-linux"; });
       in pkgs.wurzelpfropf`,
  ]);
  expect(nix.determineSystem).toHaveBeenCalledTimes(1);
  expect(nix.getRepoLockedUrl).toHaveBeenCalledTimes(1);
  expect(nix.getNixpkgs).toHaveBeenCalledTimes(1);
  expect(nix.runNix).toHaveBeenCalledTimes(1);
  expect(core.addPath).toHaveBeenCalledWith(path.join(nixProfileDir, "bin"));
});

test("installs packages and expr into profile with inputs-from", async () => {
  jest.spyOn(core, "getInput").mockImplementation((name, options?) => {
    switch (name) {
      case "expr":
        return "pkgs.wurzelpfropf";
      case "packages":
        return "nixpkgs#wuffmiau";
      case "inputs-from":
        return ".";
      default:
        throw Error("Should not reach here");
    }
  });

  jest.spyOn(nix, "maybeAddNixpkgs").mockImplementation(async (pkg) => pkg);

  jest.spyOn(nix, "getFlakeLockedUrl").mockImplementation(async (flakeRef) => {
    switch (flakeRef) {
      case ".":
        return "file:///nix/store/nyr21fwgx0wzf1j94hd42icc7ffvh8jr-source?narHash=sha256-I4cKCEg3yeO0G4wuA/ohOJPdM2ag1FtqnhwEdsC8PDk=";
      default:
        throw Error(`Should not reach here: ${flakeRef}`);
    }
  });

  jest.spyOn(nix, "getRepoLockedUrl").mockImplementation(async (_path) => {
    expect(_path).toBe(path.resolve(process.cwd()));
    return "file:///nix/store/nyr21fwgx0wzf1j94hd42icc7ffvh8jr-source?narHash=sha256-I4cKCEg3yeO0G4wuA/ohOJPdM2ag1FtqnhwEdsC8PDk=";
  });

  jest.spyOn(nix, "getRepoLockedUrl").mockImplementation(async (_path) => {
    expect(_path).toBe(path.resolve(process.cwd()));
    return "file:///nix/store/nyr21fwgx0wzf1j94hd42icc7ffvh8jr-source?narHash=sha256-I4cKCEg3yeO0G4wuA/ohOJPdM2ag1FtqnhwEdsC8PDk=";
  });

  jest.spyOn(nix, "getNixpkgs").mockImplementation(async (_path) => {
    expect(_path).toBe(
      "file:///nix/store/nyr21fwgx0wzf1j94hd42icc7ffvh8jr-source?narHash=sha256-I4cKCEg3yeO0G4wuA/ohOJPdM2ag1FtqnhwEdsC8PDk="
    );
    return `(builtins.getFlake("file:///nix/store/q3ihs6gz300xg08jhvih2w7r50w7nbnn-source?narHash=sha256-KD9fHTbTnbbyG15Bprf43FwrShKfpkFk+p+hSp5wYoU=")).inputs.nixpkgs`;
  });

  jest
    .spyOn(nix, "determineSystem")
    .mockImplementation(async () => "i686-linux");

  await main();

  const nixProfileDir = await getAndDeleteCreatedProfileDir();
  expect(nix.runNix).toBeCalledWith([
    "profile",
    "install",
    "--profile",
    nixProfileDir,
    "--inputs-from",
    "file:///nix/store/nyr21fwgx0wzf1j94hd42icc7ffvh8jr-source?narHash=sha256-I4cKCEg3yeO0G4wuA/ohOJPdM2ag1FtqnhwEdsC8PDk=",
    "nixpkgs#wuffmiau",
  ]);

  expect(nix.maybeAddNixpkgs).toHaveBeenCalledTimes(1);
  expect(nix.getFlakeLockedUrl).toHaveBeenCalledTimes(1);
  expect(nix.getRepoLockedUrl).toHaveBeenCalledTimes(1);
  expect(nix.getNixpkgs).toHaveBeenCalledTimes(1);

  expect(nix.runNix).toBeCalledWith([
    "profile",
    "install",
    "--profile",
    nixProfileDir,
    "--expr",
    `let
         repoFlake = builtins.getFlake("file:///nix/store/nyr21fwgx0wzf1j94hd42icc7ffvh8jr-source?narHash=sha256-I4cKCEg3yeO0G4wuA/ohOJPdM2ag1FtqnhwEdsC8PDk=");
         inputsFromFlake = builtins.getFlake("file:///nix/store/nyr21fwgx0wzf1j94hd42icc7ffvh8jr-source?narHash=sha256-I4cKCEg3yeO0G4wuA/ohOJPdM2ag1FtqnhwEdsC8PDk=");
         nixpkgs = (builtins.getFlake("file:///nix/store/q3ihs6gz300xg08jhvih2w7r50w7nbnn-source?narHash=sha256-KD9fHTbTnbbyG15Bprf43FwrShKfpkFk+p+hSp5wYoU=")).inputs.nixpkgs;
         pkgs = (import nixpkgs { system = "i686-linux"; });
       in pkgs.wurzelpfropf`,
  ]);

  expect(nix.runNix).toHaveBeenCalledTimes(2);
});

async function getAndDeleteCreatedProfileDir(): Promise<string> {
  expect(mocked(core.exportVariable).mock.calls[0][0]).toEqual(
    "STATE_NIX_PROFILE_TMPDIR"
  );
  const tmpDir = mocked(core.exportVariable).mock.calls[0][1];
  await rmRF(tmpDir);
  return path.join(tmpDir, ".nix-profile");
}
