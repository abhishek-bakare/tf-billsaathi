# Use 'file' backend to persist data to your PVC mount
storage "file" {
  path = "/vault/data"
}

# Configure how Vault listens for requests
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1 # Set to 0 and add certs for production
}

# Enable the Web UI
ui = true

# strict read-only policy
path "secret/data/billsaathi/admin" {
  capabilities = ["read"]
}


path "secret/data/billsaathi/ecom" {
  capabilities = ["read"]
}
