import { dataStore } from "../src/server/data";
import { readDocuments } from "../src/server/modules/documents";

async function validate() {
  if (process.argv.length > 2) throw new Error("Document validation does not accept arguments");
  const counts = { prose: 0, official_hosts: 0 };
  const hosts = new Set<string>();
  for await (const { doc } of readDocuments(dataStore())) {
    if (doc.hostname) {
      counts.official_hosts++;
      hosts.add(doc.hostname);
    } else {
      counts.prose++;
    }
  }
  console.log(JSON.stringify({ ...counts, hosts: hosts.size, total: counts.prose + counts.official_hosts }, null, 2));
}

validate().catch((error) => {
  console.error("Document validation failed:", error);
  process.exitCode = 1;
});
