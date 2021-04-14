# nix-profile-action

A GitHub Action to install [Nix](https://nixos.org/) packages into an ephemeral profile.

The action is particularly useful if you use a self-hosted GitHub Actions Runner
on NixOS. Third-party actions frequently require certain tools to be installed
which are by default not available to the runner. With this action, you can install
Nix packages easily making them available to following actions.

As soon as the action terminates—no matter if successful or unsuccessful—the profile is purged to
allow garbage collection of all installed derivations.

## Usage

Install `packages` by giving a comma-separated string of packages from a flake.
If no flake reference is given, `nixpkgs` from the checked out repository's flake
is assumed. Example:

```yaml
name: "Test"
on:
  pull_request:
  push:
jobs:
  tests:
    runs-on: self-hosted
  steps:
    - name: Checkout
      uses: actions/checkout@v2
      with:
        # Nix Flakes doesn't work on shallow clones
        fetch-depth: 0
    - uses: yaxitech/nix-profile-action@TODO
      with:
        packages: nixpkgs#hello, figlet
    - run: |
        hello
        figlet "Hello nix-profile-action!"
```

On some occassions, you need a to compose a custom derivation from an expression. To install
Python3 with specific packages installed, you can use `expr`. This string is evaluated
using `nix profile install --expr`. Within your expression, `nixpkgs` from the checked out 
repository's flake is available as `pkgs`. Example:

```yaml
name: "Test"
on:
  pull_request:
  push:
jobs:
  tests:
    runs-on: self-hosted
  steps:
    - name: Checkout
      uses: actions/checkout@v2
      with:
        # Nix Flakes doesn't work on shallow clones
        fetch-depth: 0
    - uses: yaxitech/nix-profile-action@TODO
      with:
        expr: pkgs.python3.withPackages(ps: with ps; [ cryptography pyyaml ])
    - run: |
        python3 ...
```

## Prerequisites

This action requires a Flake-enabled Nix with support for
[profiles](https://nixos.org/manual/nix/unstable/command-ref/new-cli/nix3-profile.html).
On NixOS, the following configuration is sufficient:

```Nix
nix = {
  package = pkgs.nixFlakes;
  extraOptions = ''
    experimental-features = nix-command flakes ca-references
  '';
};
```

## Development notes

After you changed `package.json`, you also need to refresh the Nix packages in
`node-env`. You can do so by first deleting the `node_modules` directory and
then run (in the top-level directory): `nix run .#refresh-node-env`.
