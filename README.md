# WRITE ME

## Development notes

After you changed `package.json`, you also need to refresh the Nix packages in
`node-env`. You can do so by first deleting the `node_modules` directory and
then run (in the top-level directory): `nix run .#refresh-node-env`.
