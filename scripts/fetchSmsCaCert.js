const fs = require("fs");
const path = require("path");
const tls = require("tls");

const host = "connectsms.mtc.com.na";
const outputPath = path.join(
  __dirname,
  "../certs/connectsms-intermediate.pem"
);

const socket = tls.connect(
  { host, port: 443, servername: host, rejectUnauthorized: false },
  () => {
    const leaf = socket.getPeerCertificate(true);
    const intermediate = leaf.issuerCertificate;

    if (!intermediate?.raw) {
      console.error("Could not retrieve intermediate certificate.");
      socket.end();
      process.exit(1);
    }

    const base64 = intermediate.raw.toString("base64");
    const pem =
      "-----BEGIN CERTIFICATE-----\n" +
      base64.match(/.{1,64}/g).join("\n") +
      "\n-----END CERTIFICATE-----\n";

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, pem);

    console.log(`Saved ${intermediate.subject.CN} to ${outputPath}`);
    socket.end();
  }
);

socket.on("error", (error) => {
  console.error("Failed to fetch certificate:", error.message);
  process.exit(1);
});
