import { ExecOutput } from "@actions/exec";
import * as nix from "../src/nix";

// The online tests run quite slowly on GitHub Actions
jest.setTimeout(90 * 1000);

afterEach(() => {
  jest.clearAllMocks();
});

test("runNix returns Nix output", () => {
  return expect(
    nix.runNix(["eval", "--offline", "--expr", '"wurzelpfropf"']),
  ).resolves.toEqual({
    stdout: '"wurzelpfropf"\n',
    stderr: "",
    exitCode: 0,
  } as ExecOutput);
});

test("determineSystem() returns system", () => {
  return expect(nix.determineSystem()).resolves.toMatch(
    /^(aarch64-linux|i686-linux|x86_64-linux|x86_64-darwin|aarch64-darwin)$/,
  );
});

test("maybeAddNixpkgs fails for invalid package", async () => {
  await expect(nix.maybeAddNixpkgs("wurzel:pfropf")).rejects.toThrow(
    `Given flake reference "wurzel:pfropf" is invalid: error: input 'wurzel:pfropf' is unsupported`,
  );
});

test("maybeAddNixpkgs adds nixpkgs#", async () => {
  const res = await nix.maybeAddNixpkgs("wurzelpfropf");
  expect(res).toBe("nixpkgs#wurzelpfropf");
});

test("maybeAddNixpkgs does not add nixpkgs#", async () => {
  expect(nix.maybeAddNixpkgs("nixpkgs#wurzelpfropf")).resolves.toBe(
    "nixpkgs#wurzelpfropf",
  );
  expect(nix.maybeAddNixpkgs(".#default")).resolves.toBe(".#default");
  expect(nix.maybeAddNixpkgs(".")).resolves.toBe(".");
});

test("maybeAddNixpkgs does not add nixpkgs# [online]", async () => {
  expect(nix.maybeAddNixpkgs("github:yaxitech/ragenix")).resolves.toBe(
    "github:yaxitech/ragenix",
  );
});

test("getRepoLockedUrl works", async () => {
  jest.spyOn(nix, "getRepoLockedUrl");

  const res = await nix.getRepoLockedUrl(".");
  expect(res).toMatch(/^file:\/\/\/nix\/store\/.*?\?narHash\=.*$/);
  expect(nix.getRepoLockedUrl).toHaveBeenCalledTimes(1);
});

test("getRepoLockedUrl does not fail for invalid flake", async () => {
  jest.spyOn(nix, "getRepoLockedUrl");

  const res = await nix.getRepoLockedUrl("/");
  expect(res).toBe("");
  expect(nix.getRepoLockedUrl).toHaveBeenCalledTimes(1);
});

test("getFlakeLockedUrl works", async () => {
  jest.spyOn(nix, "getFlakeLockedUrl");

  const res = await nix.getFlakeLockedUrl(".");
  expect(res).toMatch(/^file:\/\/\/nix\/store\/.*?\?narHash\=.*$/);
  expect(nix.getFlakeLockedUrl).toHaveBeenCalledTimes(1);
});

test("getFlakeLockedUrl fails for invalid flake", async () => {
  jest.spyOn(nix, "getFlakeLockedUrl");

  await expect(() => nix.getFlakeLockedUrl("doesnotexist")).rejects.toThrow(
    /The process '\/.*?\/nix' failed with exit code 1/,
  );
  expect(nix.getFlakeLockedUrl).toHaveBeenCalledTimes(1);
});

test("getNixpkgs with inputs-from works", async () => {
  const inputsFromLockedUrl = await nix.getRepoLockedUrl(".");
  const res = await nix.getNixpkgs(inputsFromLockedUrl);
  expect(res).toBe(
    `(builtins.getFlake("${inputsFromLockedUrl}")).inputs.nixpkgs`,
  );
  const execRes = await nix.runNix(["eval", "--json", "--expr", res], {
    ignoreReturnCode: true,
  });
  expect(execRes.stdout).toMatch(/^"\/nix\/store\/.*?"/);
});

test("getNixpkgs without inputs-from works", async () => {
  const inputsFromLockedUrl = await nix.getRepoLockedUrl("wurzel:pfropf");
  expect(inputsFromLockedUrl).toBe("");
  const res = await nix.getNixpkgs(inputsFromLockedUrl);
  expect(res).toMatch(
    /^builtins\.getFlake\(\"file:\/\/\/nix\/store\/.*?\?narHash\=.*\"\)$/,
  );
  const execRes = await nix.runNix(["eval", "--json", "--expr", res], {
    ignoreReturnCode: true,
  });
  expect(execRes.stdout).toMatch(/^"\/nix\/store\/.*?"/);
});
