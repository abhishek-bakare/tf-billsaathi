# TO setup ArgoCD Image Updater follow below steps

Using argocd repo
#kubectl create ns argocd
#kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/v0.12.2/manifests/install.yaml

We are using ghcr.io registry, if you are using different one secrets are differ, check once online
Create Secrets for ArgoCD & link to it
#kubectl create secret docker-registry ghcr-login \
  --namespace argocd \
  --docker-server=ghcr.io \
  --docker-username=<YOUR_GITHUB_USERNAME> \
  --docker-password=<YOUR_GITHUB_PAT>

We also require 1 more generic secrets for argocd-yaml annotations to write-back the commits
#kubectl create secret generic git-creds --from-literal=username=abhishek-bakare  --from-literal=password=<access-token> -n argocd

Edit config map to add this secret fetch
#kubectl edit configmap argocd-image-updater-config -n argocd

data:
  registries.conf: |
    registries:
    - name: GitHub Container Registry
      api_url: https://ghcr.io
      prefix: ghcr.io
      credentials: pullsecret:argocd/ghcr-login

After updating ConfigMap create argocd annotations file like created here in k8s/argocd/argocd.yaml
lets apply both the files ensure we installed full ArgoCR application and its CRD just use below to install
#kubectl apply -n argocd --server-side -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

To get the initial pass
#kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
