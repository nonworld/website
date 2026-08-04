/* Is this module the one node was asked to run?
   ==========================================================================
   The naive check — `import.meta.url === \`file://${process.argv[1]}\`` — is
   false on this machine and has silently broken three scripts. The repo lives
   under "/Users/aarontrotman/Claude Code", and import.meta.url percent-encodes
   that space as %20 while process.argv[1] does not. The comparison fails, the
   main block never runs, and the script exits 0 having done nothing. It looks
   exactly like success.

   pathToFileURL applies the same encoding to both sides. argv[1] is also
   guarded because it is undefined under `node -e`, where a module is imported
   rather than run.

   Import this rather than rewriting the check. It has been rediscovered three
   times; a fourth is a certainty otherwise.
*/
import { pathToFileURL } from 'node:url';

export const isMain = (importMetaUrl) => Boolean(process.argv[1])
  && importMetaUrl === pathToFileURL(process.argv[1]).href;
