TO setup Vault in prod we can first install on K8 cluster using "vault.yaml" & its ingress.
1. Always install Vault using official helm charts
2. High availability: dpeloy min of 3 replicas to ensure fault tolerance
3. Use integrated storage Raft
4. When pod restart vault is sealed state & cannot read data until unsealed. So use auto-unseal using cloud KMS (AWS KMS, Azure Key Vault, or Google Cloud KMS).

Generate the unseal and root keys for future preferences

Then try to access the vault in browser

Add your secrets using vault cli by exec to vault pod

How K8 authenticate with vault:
1. Use of SA
2. K8 generates a JSON Web token for that SA
3. Authentication: Pod sends JWT to vault. Vault uses the Kubernetes Token Reviewer API to verify that the token is valid, checking the pod's Service Account name and Namespace.
4. Authorization: If valid, Vault checks its internal Roles and Policies to see what secrets that specific Service Account is allowed to read.

3 ways we can deliver secrets to pods:
1. Vault Secrets Operator (VSO) — Best for Native K8s Experience
2. Vault Agent Sidecar Injector — Best for High Security
3. External Secrets Operator (ESO) — Best for Multi-Cloud

Once vault setup, secrets added then we can apply policies to the secrets
exec to vault and apply below policies
ecompolicy.hcl
path "secret/data/billsaathi/ecom" {
  capabilities = ["read"]
}
-------
adminpolicy.hcl
path "secret/data/billsaathi/admin" {
  capabilities = ["read"]
}
Apply using below cmd
#vault policy write policy-name policy.hcl

Now enable K8 auth in vault & configure it to talk to k8 API
#vault auth enable kubernetes
#vault write auth/kubernetes/config kubernetes_host="https://kubernetes.default.svc.cluster.local"

Now we need to create SA (cmd or yaml) in our app ns like admin & ecom to talk with vault
#kubectl create serviceaccount admin-sa -n admin
#kubectl create serviceaccount ecom-sa -n ecom

We need to create vault-rbac.yaml also

Now we need to bind both SAs & ns to the specific policy 
#vault write auth/kubernetes/role/admin-role bound_service_account_names=admin-sa bound_service_account_namespaces=admin policies=adminpolicy audience=vault ttl=24h

#vault write auth/kubernetes/role/ecom-role bound_service_account_names=ecom-sa bound_service_account_namespaces=ecom policies=ecompolicy audience=vault ttl=24h

Now using ESO we need to create SecreStore for both the app admin, ecom
create using files secretstore.yaml

Try to apply secretstore and check the status for Valid. If valid means it worked.

