# nix-install-pkgs-action

![Coverage](https://github.com/yaxitech/nix-install-pkgs-action/blob/gh-pages/coverage.svg)

A GitHub Action to install [Nix][nixos] packages into an ephemeral profile.

The action is particularly useful if you use a self-hosted [GitHub Actions Runner
on NixOS][nixos-runner]. Third-party actions frequently require certain tools to be installed
which are by default not available to the runner. With this action, you can install
Nix packages easily making them available to following actions.

As soon as the action terminates—no matter if successfully or unsuccessfully—the profile is purged to
allow garbage collection of all installed derivations.

[nixos]: https://nixos.org
[nixos-runner]: https://search.nixos.org/options?channel=unstable&query=services.github-runner.

## Usage

The action supports installing derivations from Flake packages and by evaluating a given expression.
Installation happens through `nix profile`.

You may call this action multiple times within the same job. Following steps will reuse the profile.
The path of the profile is also available with the step output `nix_profile_path`.

### Packages

Install `packages` by giving a comma-separated string of packages from a flake.
If no flake reference is given, `nixpkgs` is assumed. Example:

```yaml
name: 'nix-install-pkgs-action packages'
on:
  - pull_request
  - push
jobs:
  tests:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: yaxitech/nix-install-pkgs-action@v3
        with:
          packages: "nixpkgs#hello, figlet"
      - run: |
          hello
          figlet "Hello nix-install-pkgs-action!"

```

When installing flakes which reference a registry entry, the action resolves them as follows:

- If the input `inputs-from` is given, the action invokes `nix profile install --inputs-from`.
   As a result, `nixpkgs#hello` will look up `nixpkgs` using the inputs of the flake given in
   `inputs-from`. 
- `inputs-from` defaults to `.`, i.e., the current working directory of the process. If this
   directory (or a parent) contains a valid flake, `nix profile install` is invoked with this
   flake.
- If `inputs-from` is unset (i.e., `""`), `nix profile` resolves tokens using the registry.

### Expressions

On some occasions, you need to compose a custom derivation from a Nix expression, for example,
to install Python 3 with specific packages. This can be done with the `expr` input.
The action evaluates the passed string through `nix profile install --expr`.
Within your expression, the actions provides an imported `nixpkgs` as `pkgs` using the same
resolution strategy as outlined for the `packages` input.
In the following example, `pkgs` references `inputs.nixpkgs` from the flake `github:yaxitech/ragenix`:

```yaml
name: 'nix-install-pkgs-action expr'
on:
  - pull_request
  - push
jobs:
  tests:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: yaxitech/nix-install-pkgs-action@v3
        with:
          expr: 'pkgs.python3.withPackages(ps: with ps; [toml pyyaml])'
          inputs-from: 'github:yaxitech/ragenix'
      - run: |
          python3 ...
```

Within your expression, the action also introduces `let` bindings for a flake in the current
working directory (`repoFlake`) and for the flake referenced by `inputs-from` (`inputsFromFlake`).

## Prerequisites

This action requires a Flake-enabled Nix with support for
[profiles](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-profile.html).

### NixOS

```nix
{
  nix.settings.experimental-features = [ "nix-command" "flakes" ];
}
```

### Non-NixOS

Use [`cachix/install-nix-action`](https://github.com/cachix/install-nix-action#usage-with-flakes)
to install Nix with flake support.

## Development notes

After you changed `package.json`, you also need to update `npmDepsHash` in `flake.nix`.
You can acquire the hash by running: `nix develop -c prefetch-npm-deps package-lock.json`.

Some of the TypeScript tests invoke `nix` during test execution. That means if
you invoke the tests through `nix`, for example as part of `nix build`, a nix
that has the `recursive-nix` feature enabled is required. You can put the
following snippet into your `configuration.nix`:

```nix
{
  nix.settings = {
    experimental-features = [ "nix-command" "flakes" "recursive-nix" ];
    system-features = [ "recursive-nix" ];
  };
}
```
