import * as core from "@actions/core";
import { rmRF } from "@actions/io";

async function post() {
  const nixProfileTmpDir = process.env.STATE_NIX_PROFILE_TMPDIR;
  if (nixProfileTmpDir) {
    console.log("Deleting " + nixProfileTmpDir);
    await rmRF(nixProfileTmpDir);
  }
}

post().catch((error) => core.setFailed("Cleanup failed: " + error.message));
