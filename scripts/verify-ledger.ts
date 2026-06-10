/** Standalone integrity check. Exit 1 if the chain is broken. */
import { verifyChain } from "../lib/ledger/ledger";

verifyChain().then(({ ok, brokenAt }) => {
  if (ok) {
    process.stdout.write("LEDGER OK — chain verified from genesis\n");
    process.exit(0);
  }
  process.stdout.write(`LEDGER TAMPERED — chain breaks at seq ${brokenAt}\n`);
  process.exit(1);
});
