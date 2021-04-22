import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { rmRF } from "@actions/io";
import * as fs from "fs";
import * as path from "path";
import { mocked } from "ts-jest/utils";

import main from "../src/main";

jest.mock("@actions/core");
jest.mock("@actions/exec");

afterEach(() => {
  jest.clearAllMocks();
  jest.resetAllMocks();
});

test("installs packages into profile", async () => {
  jest.spyOn(core, "getInput").mockImplementation((name, options?) => {
    switch (name) {
      case "packages":
        return "package1,nixpkgs#package2";
      default:
        return "";
    }
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
  ]);
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
  expect(exec.exec).toBeCalledWith("nix", [
    "profile",
    "install",
    "--profile",
    nixProfileDir,
    "--expr",
    `let
         repoFlake = builtins.getFlake("git+file://" + (toString ./.) + "?rev=0000000000000000000000000000000000000000");
         pkgs = (import repoFlake.inputs.nixpkgs { system = "i686-linux"; });
       in pkgs.wurzelpfropf`,
  ]);
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
