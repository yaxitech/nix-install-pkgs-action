import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from "fs";
import * as path from "path";
import { mocked } from "ts-jest/utils";

import main from "../src/main";

jest.mock("@actions/core");
jest.mock("@actions/exec");

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

  expect(mocked(core.exportVariable).mock.calls[0][0]).toEqual(
    "STATE_NIX_PROFILE_TMPDIR"
  );
  const tmpDir = mocked(core.exportVariable).mock.calls[0][1];
  expect(exec.exec).toBeCalledWith("nix", [
    "profile",
    "install",
    "--profile",
    path.join(tmpDir, ".nix-profile"),
    "nixpkgs#package1",
    "nixpkgs#package2",
  ]);
});
