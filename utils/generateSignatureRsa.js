import forge from "node-forge";

export default function generateSignatureRsa (privateKeyPem, payload) {
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

  // Create a SHA-256 hash of the payload
  const md = forge.md.sha256.create();
  md.update(payload, "utf8");

  // Sign the hash with the private key
  const signature = privateKey.sign(md);

  // Convert the signature to Base64
  return forge.util.encode64(signature);
}
