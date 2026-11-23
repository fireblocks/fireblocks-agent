# Kubernetes JSON schemas for render.sh

kubeconform validates the rendered chart against these files only, so CI makes no schema downloads.
They are the Kubernetes 1.31 schemas, in standalone-strict form, for exactly the kinds that the
`ci/*-values.yaml` renders produce. OpenShift 4.18 runs Kubernetes 1.31 and 4.19 runs 1.32: the
older of the two is the API set every supported cluster has.

Source: https://github.com/yannh/kubernetes-json-schema, commit
`aeab6ebb38b801eb0e6b4dc6692ae68035054401`, directory `v1.31.14-standalone-strict/`, files copied
unchanged.

## Refreshing or adding a kind

A kind with no schema here makes render.sh fail with "could not find schema". To add one, or to move
to another Kubernetes version, list the kinds the renders produce, then download each file from a
pinned commit:

```sh
chart=deploy/helm/fireblocks-agent
for v in "$chart"/ci/*-values.yaml; do helm template t "$chart" -f "$v"; done |
  grep -E '^(apiVersion|kind):' | paste - - | sort -u

commit=aeab6ebb38b801eb0e6b4dc6692ae68035054401
dir=v1.31.14-standalone-strict
mkdir -p "$chart/test/schemas/$dir"
for f in deployment-apps-v1 job-batch-v1 networkpolicy-networking-v1 role-rbac-v1 rolebinding-rbac-v1 secret-v1 serviceaccount-v1; do
  curl -fsSL -o "$chart/test/schemas/$dir/$f.json" \
    "https://raw.githubusercontent.com/yannh/kubernetes-json-schema/$commit/$dir/$f.json"
done
```

File names are the lowercase kind, then the API group's first label (none for the core group), then
the version: `deployment-apps-v1`, `networkpolicy-networking-v1`, `service-v1`. When you change
the version, also change `k8s_version` in render.sh, since it selects the directory.
