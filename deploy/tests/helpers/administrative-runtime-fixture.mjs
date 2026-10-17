import { ADMIN_RUNTIME_BINARIES } from "../../../backend/scripts/lib/heatwave-administrative-runtime.js";
// Synthetic facts for contract tests, not production evidence or an operational switch.
export const runtimeFixture = () => ({
  platform: "linux",
  arch: "arm64",
  execPath: "/usr/bin/node-22",
  node: "22.23.2",
  openssl: "3.0.17",
  release: "Oracle Linux Server release 9.8",
  selinux: "1",
  context: "unconfined_u:unconfined_r:unconfined_t:s0-s0:c0.c1023",
  binaries: { ...ADMIN_RUNTIME_BINARIES },
});
