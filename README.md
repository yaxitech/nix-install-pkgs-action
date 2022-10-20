# nix-profile-action

![Coverage](https://github.com/yaxitech/nix-profile-action/blob/gh-pages/coverage.svg)

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

Install `packages` by giving a comma-separated string of packages from a flake.
If no flake reference is given, `nixpkgs` from the checked out repository's flake
is assumed. Example:

```yaml
name: 'nix-profile-action packages'
on:
  - pull_request
  - push
jobs:
  tests:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v3
      - uses: yaxitech/nix-profile-action@v2
        with:
          packages: "nixpkgs#hello, figlet"
      - run: |
          hello
          figlet "Hello nix-profile-action!"

```

On some occasions, you need to compose a custom derivation from a Nix expression, for example,
to install Python 3 with specific packages. This can be done with the `expr` input.
The action evaluates the passed string through `nix profile install --expr`.
Within your expression, `nixpkgs` from the checked out repository's flake is available as `pkgs`,
while the repository's flake itself is available as `repoFlake`. Example:

```yaml
name: 'nix-profile-action expr'
on:
  - pull_request
  - push
jobs:
  tests:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v3
      - uses: yaxitech/nix-profile-action@v2
        with:
          expr: 'pkgs.python3.withPackages(ps: with ps; [toml pyyaml])'
      - run: |
          python3 ...
```

## Prerequisites

This action requires a Flake-enabled Nix with support for
[profiles](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix3-profile.html).

### NixOS

```nix
{
  nix.settings.experimental-features = [ "nix-command" "flakes" "ca-references" ];
}
```

### Non-NixOS

Use [`cachix/install-nix-action`](https://github.com/cachix/install-nix-action#usage-with-flakes)
to install Nix with flake support.
Make sure you also add `ca-references` to the input `extra_nix_config`:

```yaml
extra_nix_config: |
  experimental-features = nix-command flakes ca-references
```

## Development notes

After you changed `package.json`, you also need to refresh the Nix packages in
`node-env`. You can do so by first deleting the `node_modules` directory and
then run (in the top-level directory): `nix run .#refresh-node-env`.

Some of the TypeScript tests invoke `nix` during test execution. That means if
you invoke the tests through `nix`, for example as part of `nix build`, a nix
that has the `recursive-nix` feature enabled is required. You can put the
following snippet into your `configuration.nix`:

```nix
{
  nix.settings = {
    experimental-features = [ "nix-command" "flakes" "ca-references" ];
    system-features = [ "recursive-nix" ];
  };
}
```
