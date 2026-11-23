#!/bin/sh
# Renders the chart the way CI does: helm lint --strict and helm template | kubeconform for every
# ci/*-values.yaml, then one render per fail guard, which must fail with that guard's message.
# Needs helm and kubeconform. Run from anywhere: sh deploy/helm/fireblocks-agent/test/render.sh
set -eu
chart=$(cd "$(dirname "$0")/.." && pwd)
fail=0

# kubeconform validates offline, against the schemas in test/schemas only (see test/schemas/README.md),
# so it never downloads anything. A kind with no schema there fails the run: add its schema.
k8s_version=1.31.14
schemas="$chart/test/schemas/{{ .NormalizedKubernetesVersion }}-standalone{{ .StrictSuffix }}/{{ .ResourceKind }}{{ .KindSuffix }}.json"
validate() {
  kubeconform -strict -summary -kubernetes-version "$k8s_version" -schema-location "$schemas"
}

for values in "$chart"/ci/*-values.yaml; do
  name=$(basename "$values")
  if helm lint "$chart" -f "$values" --strict >/dev/null 2>&1 &&
    helm template t "$chart" -f "$values" | validate >/dev/null; then
    echo "ok   $name renders and validates"
  else
    echo "FAIL $name"
    helm lint "$chart" -f "$values" --strict 2>&1 | sed 's/^/     /' || true
    helm template t "$chart" -f "$values" 2>&1 | validate 2>&1 | sed 's/^/     /' || true
    fail=1
  fi
done

# expect_fail <expected message fragment> <helm template arguments...>
# Every case starts from ci/keylink-flow-values.yaml, which renders, and changes one thing.
base="$chart/ci/keylink-flow-values.yaml"
expect_fail() {
  want=$1
  shift
  if out=$(helm template t "$chart" -f "$base" "$@" 2>&1); then
    echo "FAIL rendered, expected an error containing: $want ($*)"
    fail=1
  elif printf '%s' "$out" | grep -qF -- "$want"; then
    echo "ok   fails: $want"
  else
    echo "FAIL expected an error containing: $want ($*)"
    printf '%s\n' "$out" | sed 's/^/     /'
    fail=1
  fi
}

pairing="--set pairing.enabled=true --set pairing.tokenSecret=fireblocks-agent-pairing-token"

expect_fail "image.repository and image.tag (or image.digest) are required" --set image.tag=
expect_fail "customerServer.url is required" --set customerServer.url=
# customerServer.url: https://, or http:// only with allowInsecureHttp, in any case; anything else fails
# the render instead of crash-looping the Agent.
scheme="customerServer.url must start with https:// (http:// only with customerServer.allowInsecureHttp=true)"
expect_fail "$scheme" --set customerServer.url=keylink-flow:5000/api
expect_fail "$scheme" --set customerServer.url=keylink-flow.keylink-flow.svc
expect_fail "$scheme" --set customerServer.url=ftp://keylink-flow:5000/api
expect_fail "$scheme" --set customerServer.url=ws://keylink-flow:5000/api
expect_fail "$scheme" --set 'customerServer.url= https://keylink-flow:5000/api'
expect_fail "customerServer.url is not a valid URL" --set customerServer.url=https://
expect_fail "customerServer.url is not a valid URL" --set 'customerServer.url=https://keylink flow:5000/api'
expect_fail "customerServer.url is http://: the Agent refuses" --set customerServer.ca.configMap= \
  --set customerServer.url=HTTP://keylink-flow:5000/api
expect_fail "customerServer.allowInsecureHttp is only for an http:// customerServer.url" \
  --set customerServer.allowInsecureHttp=true --set customerServer.url=HTTPS://keylink-flow:5000/api
expect_fail "customerServer.ca: set configMap or secret, not both" --set customerServer.ca.secret=server-ca
expect_fail "customerServer.ca is only used with an https:// customerServer.url" \
  --set customerServer.url=http://keylink-flow:5000/api
expect_fail "customerServer.url is http://: the Agent refuses" --set customerServer.ca.configMap= \
  --set customerServer.url=http://keylink-flow:5000/api
expect_fail "customerServer.allowInsecureHttp is only for an http:// customerServer.url" \
  --set customerServer.allowInsecureHttp=true
expect_fail "pairing.tokenSecret is required with pairing.enabled" --set pairing.enabled=true
expect_fail "proxy: set url or existingSecret, not both" --set proxy.url=http://proxy.example.com:3128 \
  --set proxy.existingSecret=outbound-proxy --set proxy.port=3128 --set 'proxy.cidrs={192.0.2.10/32}'
expect_fail "proxy.url must be http://host:port or https://host:port, without a user name or password" \
  --set proxy.url=http://someone@proxy.example.com:3128 --set 'proxy.cidrs={192.0.2.10/32}'
expect_fail "proxy.existingSecret needs proxy.port" --set proxy.existingSecret=outbound-proxy \
  --set 'proxy.cidrs={192.0.2.10/32}'
expect_fail "proxy needs proxy.cidrs" --set proxy.url=http://proxy.example.com:3128
expect_fail "caBundle: set configMap or secret, not both" --set caBundle.configMap=ca --set caBundle.secret=ca
# shellcheck disable=SC2086
expect_fail "pairing with a proxy or networkPolicy.fireblocksCidrs needs pairing.apiServerCidrs" $pairing \
  --set 'networkPolicy.fireblocksCidrs={203.0.113.0/24}'
# shellcheck disable=SC2086
expect_fail "pairing with a proxy or networkPolicy.fireblocksCidrs needs pairing.apiServerCidrs" $pairing \
  --set proxy.url=http://proxy.example.com:3128 --set 'proxy.cidrs={192.0.2.10/32}'
expect_fail "must be sha256: followed by 64 lowercase hexadecimal characters" --set image.digest=sha256:abc
expect_fail "networkPolicy.customerServerPort \"https\" must be a port number" \
  --set networkPolicy.customerServerPort=https
# shellcheck disable=SC2086
expect_fail "must be sha256: followed by 64 lowercase hexadecimal characters" $pairing \
  --set pairing.cliImage.digest=v4.18

# values.schema.json: wrong types and unknown keys are refused before any template runs.
expect_fail "at '/livenessProbe/maxAgeSeconds': got string, want integer" --set livenessProbe.maxAgeSeconds=five
expect_fail "at '/pairing/enabled': got string, want boolean" --set-string pairing.enabled=true
expect_fail "additional properties 'fireblocksCIDRs' not allowed" --set 'networkPolicy.fireblocksCIDRs={203.0.113.0/24}'
expect_fail "additional properties 'imagePullSecret' not allowed" --set 'imagePullSecret=registry'
expect_fail "at '/platform': value must be one of 'openshift', 'kubernetes'" --set platform=gke
expect_fail "at '/pairing/cli': value must be one of" --set pairing.cli=kubectl1
expect_fail "platform=kubernetes needs runAsNonRoot: true and a non-zero runAsUser" --set platform=kubernetes \
  --set kubernetes.podSecurityContext.runAsUser=0
# shellcheck disable=SC2086
expect_fail "must be sha256: followed by 64 lowercase hexadecimal characters" $pairing --set platform=kubernetes \
  --set pairing.kubectlImage.digest=v1.35.9

# expect_render <description> <present|absent> <fixed string> <helm template arguments...>
# Renders from ci/keylink-flow-values.yaml and checks that the output holds, or lacks, the string.
expect_render() {
  what=$1
  mode=$2
  needle=$3
  shift 3
  if ! out=$(helm template t "$chart" -f "$base" "$@" 2>&1); then
    echo "FAIL $what: did not render ($*)"
    printf '%s\n' "$out" | sed 's/^/     /'
    fail=1
  elif printf '%s' "$out" | grep -qF -- "$needle"; then
    if [ "$mode" = present ]; then echo "ok   $what"; else echo "FAIL $what: found '$needle' ($*)"; fail=1; fi
  else
    if [ "$mode" = absent ]; then echo "ok   $what"; else echo "FAIL $what: no '$needle' ($*)"; fail=1; fi
  fi
}

# The liveness probe reads the heartbeat file the Agent writes when HEARTBEAT_FILE is set.
heartbeat=/tmp/fireblocks-agent-heartbeat
# The Customer Server over HTTPS: the CA file setting, the OpenShift service CA by default.
expect_render "CA file from customerServer.ca" present 'name: CUSTOMER_SERVER_CA_FILE'
expect_render "no old CA variable name" absent 'SSL_CERT_PATH'
expect_render "customerServer.ca mounted" present 'name: keylink-flow-service-ca'
expect_render "service CA ConfigMap by default on OpenShift" present 'service.beta.openshift.io/inject-cabundle: "true"' \
  --set customerServer.ca.configMap=
expect_render "service CA mounted by default on OpenShift" present 'value: "/run/secrets/fireblocks-agent/customer-server-ca/service-ca.crt"' \
  --set customerServer.ca.configMap=
expect_render "no service CA ConfigMap with customerServer.ca" absent 'inject-cabundle'
expect_render "no service CA with trustServiceCa=false" absent 'CUSTOMER_SERVER_CA_FILE' \
  --set customerServer.ca.configMap= --set customerServer.trustServiceCa=false
expect_render "no service CA on Kubernetes" absent 'inject-cabundle' --set platform=kubernetes --set customerServer.ca.configMap=
expect_render "no plain HTTP opt-out by default" absent 'ALLOW_INSECURE_CUSTOMER_SERVER'
expect_render "plain HTTP only with allowInsecureHttp" present 'name: ALLOW_INSECURE_CUSTOMER_SERVER' \
  --set customerServer.ca.configMap= --set customerServer.url=http://keylink-flow:5000/api --set customerServer.allowInsecureHttp=true
expect_render "no service CA with an http:// url" absent 'inject-cabundle' \
  --set customerServer.ca.configMap= --set customerServer.url=http://keylink-flow:5000/api --set customerServer.allowInsecureHttp=true
expect_render "an upper-case HTTP:// url with allowInsecureHttp" present 'name: ALLOW_INSECURE_CUSTOMER_SERVER' \
  --set customerServer.ca.configMap= --set customerServer.url=HTTP://keylink-flow:5000/api --set customerServer.allowInsecureHttp=true
expect_render "an upper-case HTTPS:// url trusts the service CA" present 'inject-cabundle' \
  --set customerServer.ca.configMap= --set customerServer.url=HTTPS://keylink-flow.keylink-flow.svc:5000/api

expect_render "liveness probe on by default" present 'livenessProbe:'
expect_render "heartbeat file set for the probe" present "value: \"$heartbeat\""
expect_render "probe compares the heartbeat with maxAgeSeconds" present "-lt 600 ]" --set livenessProbe.maxAgeSeconds=600
expect_render "no liveness probe when disabled" absent 'livenessProbe:' --set livenessProbe.enabled=false
expect_render "no heartbeat file when the probe is disabled" absent 'HEARTBEAT_FILE' --set livenessProbe.enabled=false

# The pairing Job fails at once, with an explanation, when the token Secret is gone (for example
# pairing.enabled left on after a successful pairing), instead of waiting for the volume.
# shellcheck disable=SC2086
expect_render "pairing token volume is optional" present 'optional: true' $pairing
# shellcheck disable=SC2086
expect_render "pair step checks for the token first" present 'does not exist or is empty: nothing was sent to Fireblocks' $pairing

# Platforms: no user ID and oc on OpenShift; on Kubernetes the Agent image's user, and kubectl,
# one command per container, the token deleted only after the Secret is patched.
gke="-f $chart/ci/gke-values.yaml --set customerServer.ca.configMap="
# shellcheck disable=SC2086
expect_render "no user ID set on OpenShift" absent "runAsUser:" $pairing
# shellcheck disable=SC2086
expect_render "oc on OpenShift" present "oc set data" $pairing
# shellcheck disable=SC2086
expect_render "user 1000 on Kubernetes" present "runAsUser: 1000" $gke
# shellcheck disable=SC2086
expect_render "no oc on Kubernetes" absent "oc set data" $gke
# shellcheck disable=SC2086
expect_render "kubectl patches the device-data Secret" present "--patch-file=/scratch/device-data-patch.json" $gke
# shellcheck disable=SC2086
expect_render "kubectl deletes the token" present "name: delete-token" $gke
# shellcheck disable=SC2086
expect_render "no token deletion when deleteTokenSecret is off" absent "name: delete-token" $gke \
  --set pairing.deleteTokenSecret=false
# shellcheck disable=SC2086
expect_render "kubectl on OpenShift with pairing.cli" present "--patch-file=/scratch/device-data-patch.json" $pairing \
  --set pairing.cli=kubectl
# shellcheck disable=SC2086
expect_render "kubectl image pinned by digest" present "registry.k8s.io/kubectl@sha256:" $gke
expect_render "OpenShift DNS port 5353 on OpenShift" present "port: 5353"
# shellcheck disable=SC2086
expect_render "no OpenShift DNS port 5353 on Kubernetes" absent "port: 5353" $gke
# The patch must come before the deletion: "store" is an init container, "delete-token" the container.
order=$(helm template t "$chart" -f "$base" -f "$chart/ci/gke-values.yaml" --set customerServer.ca.configMap= -s templates/pairing-job.yaml |
  awk '/^      initContainers:/{s="init"} /^      containers:/{s="main"} /- name: (pair|store|delete-token)$/{printf "%s:%s ", s, $3}')
if [ "$order" = "init:pair init:store main:delete-token " ]; then echo "ok   kubectl steps in order"; else echo "FAIL kubectl steps: got '$order'"; fail=1; fi

# A port in the Agent's NetworkPolicy: the first "- port:" after the line matching <marker>.
port_after() {
  marker=$1
  shift
  helm template t "$chart" -f "$base" "$@" -s templates/networkpolicy.yaml |
    awk -v m="$marker" 'index($0, m){f=1} f && /- port:/{print $3; exit}'
}
expect_port() {
  want=$1
  marker=$2
  shift 2
  got=$(port_after "$marker" "$@")
  if [ "$got" = "$want" ]; then echo "ok   port $want ($*)"; else echo "FAIL port: got '$got', want '$want' ($*)"; fail=1; fi
}

server="# The Customer Server."
expect_port 5000 "$server" --set customerServer.url=https://keylink-flow.keylink-flow.svc:5000/api
expect_port 443 "$server" --set customerServer.url=https://keylink-flow.keylink-flow.svc/api
expect_port 80 "$server" --set customerServer.url=http://keylink-flow/api --set customerServer.ca.configMap= \
  --set customerServer.allowInsecureHttp=true
expect_port 443 "$server" --set 'customerServer.url=https://[2001:db8::5]/api'
expect_port 5000 "$server" --set 'customerServer.url=https://[2001:db8::5]:5000/api'
expect_port 8443 "$server" --set customerServer.url=https://keylink-flow.keylink-flow.svc/api \
  --set networkPolicy.customerServerPort=8443
expect_port 8443 "$server" --set customerServer.url=https://keylink-flow.keylink-flow.svc:443/api \
  --set-string networkPolicy.customerServerPort=8443

proxied="# Fireblocks, through the outbound proxy only."
withproxy="--set proxy.cidrs={192.0.2.10/32}"
# shellcheck disable=SC2086
expect_port 3128 "$proxied" $withproxy --set proxy.url=http://proxy.example.com:3128
# shellcheck disable=SC2086
expect_port 80 "$proxied" $withproxy --set proxy.url=http://proxy.example.com
# shellcheck disable=SC2086
expect_port 443 "$proxied" $withproxy --set proxy.url=https://proxy.example.com
# shellcheck disable=SC2086
expect_port 80 "$proxied" $withproxy --set 'proxy.url=http://[2001:db8::1]'
# shellcheck disable=SC2086
expect_port 3128 "$proxied" $withproxy --set 'proxy.url=http://[2001:db8::1]:3128'
# shellcheck disable=SC2086
expect_port 8080 "$proxied" $withproxy --set 'proxy.url=http://[2001:db8::1]:3128' --set proxy.port=8080

exit $fail
