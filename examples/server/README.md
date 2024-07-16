# Customer server example
This server implement an example integration with HSM module assuming SoftHSM.
- Hardcoded PIN used in the example is "1234"
- The example uses first available slot which is usually slot 0
- Current example supports ECDSA secp256k1 and EdDSA Ed25519 curves

# Support for self signed certificate
The server can support self signed certificate when accepting SSL connections from the Agent.
In order to run the server with self signed certificate, follow the following steps:
1. Make sure to have an openssl Subject Alternative Name (SAN) certificates configuration file
   - You can find an example file at examples/server/env/san.cnf
2. Create a private key using openssl
   - `openssl genrsa -out priv-key.txt 2048`
3. Create a Certificate certificate signing requests (CSR) file
   - `openssl req -new -key priv-key.txt -out csr.txt -config san.cnf`
4. Create a self signed certificate
   - `openssl x509 -req -days 3650 -in csr.txt -signkey priv-key.txt -out self-signed-cert.txt -extfile san.cnf -extensions v3_req`
5. Validate the self signed certificate has all the information required
   - `openssl x509 -in self-signed-cert.txt -noout -text`
6. Add two parameters to your server environment file (e.g. /example/server/env/dev.env)
   - `SELF_SIGNED_SSL_PRIV_KEY_PATH="./env/priv-key.txt"
      SELF_SIGNED_SSL_CERT_PATH="./env/self-signed-cert.txt"`
7. Start the server, it will automatically run in SSL if the defined files are found
8. In order for the Agent to accept the self signed certificate, add the following to the Agent env file (e.g. .env.prod)
   - `SSL_CERT_PATH="./examples/server/env/self-signed-cert.txt"`