{{- define "fireblocks-agent.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "fireblocks-agent.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
The Agent's pod labels. app.kubernetes.io/name is fireblocks-agent unless nameOverride changes it;
a Customer Server's NetworkPolicy can admit the Agent by it (KeyLink Flow's chart does by default).
*/}}
{{- define "fireblocks-agent.selector" -}}
app.kubernetes.io/name: {{ include "fireblocks-agent.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: agent
{{- end -}}

{{- define "fireblocks-agent.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{ include "fireblocks-agent.selector" . }}
{{- end -}}

{{/* Pairing Job labels: deliberately not the Agent's selector, so the Agent's NetworkPolicy (which
blocks the Kubernetes API) does not apply to the Job, and the Agent Deployment never selects it. */}}
{{- define "fireblocks-agent.pairingLabels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/name: {{ include "fireblocks-agent.name" . }}-pairing
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: agent-pairing
{{- end -}}

{{/*
An image reference from a repository/tag/digest block: repository@digest when digest is set (it
takes precedence over the tag), else repository:tag.
*/}}
{{- define "fireblocks-agent.image" -}}
{{- if .digest -}}
{{- if not (regexMatch "^sha256:[0-9a-f]{64}$" .digest) -}}
{{- fail (printf "image digest %q must be sha256: followed by 64 lowercase hexadecimal characters" .digest) -}}
{{- end -}}
{{- printf "%s@%s" .repository .digest -}}
{{- else -}}
{{- printf "%s:%s" .repository (toString .tag) -}}
{{- end -}}
{{- end -}}

{{/* The heartbeat file the Agent writes for the liveness probe, in the pod's /tmp volume. */}}
{{- define "fireblocks-agent.heartbeatFile" -}}
/tmp/fireblocks-agent-heartbeat
{{- end -}}

{{- define "fireblocks-agent.deviceDataSecret" -}}
{{- default (printf "%s-device-data" (include "fireblocks-agent.fullname" .)) .Values.deviceData.secretName -}}
{{- end -}}

{{/*
The Customer Server's port for the NetworkPolicy: networkPolicy.customerServerPort (the server pod's
container port), else the port in customerServer.url (explicit port, else 443 for https, 80 for
http). A bracketed IPv6 address is removed before looking for the port, so its colons are not taken
for one.
*/}}
{{- define "fireblocks-agent.customerServerPort" -}}
{{- /* Validate first: the NetworkPolicy may render before the Deployment, and urlParse fails on a bad URL. */ -}}
{{- include "fireblocks-agent.validate" . -}}
{{- with .Values.networkPolicy.customerServerPort -}}
{{- . -}}
{{- else -}}
{{- $u := urlParse .Values.customerServer.url -}}
{{- $port := regexFind ":[0-9]+$" (regexReplaceAll "^\\[[^]]*\\]" $u.host "") -}}
{{- if $port }}{{ trimPrefix ":" $port }}{{ else }}{{ ternary 443 80 (eq $u.scheme "https") }}{{ end -}}
{{- end -}}
{{- end -}}

{{/* Fails the render early on settings the chart cannot run with. */}}
{{/*
The CA the Agent checks the Customer Server's certificate against, besides the default ones, as
"<kind>:<name>:<key>": customerServer.ca, else on OpenShift with an https:// URL and
customerServer.trustServiceCa the chart's own ConfigMap that OpenShift fills with its service CA.
Empty: the default CA certificates only.
*/}}
{{- define "fireblocks-agent.customerServerCa" -}}
{{- $ca := .Values.customerServer.ca -}}
{{- if $ca.configMap -}}configMap:{{ $ca.configMap }}:{{ $ca.key }}
{{- else if $ca.secret -}}secret:{{ $ca.secret }}:{{ $ca.key }}
{{- else if and (eq .Values.platform "openshift") .Values.customerServer.trustServiceCa (eq (include "fireblocks-agent.urlScheme" .) "https") -}}configMap:{{ include "fireblocks-agent.serviceCaConfigMap" . }}:service-ca.crt
{{- end -}}
{{- end -}}

{{- define "fireblocks-agent.serviceCaConfigMap" -}}
{{- printf "%s-service-ca" (include "fireblocks-agent.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
The scheme of customerServer.url, lowercased ("https", "http", another scheme), or empty when the
URL has none. The Agent compares the scheme case-insensitively too.
*/}}
{{- define "fireblocks-agent.urlScheme" -}}
{{- regexFind "^[A-Za-z][A-Za-z0-9+.-]*://" .Values.customerServer.url | trimSuffix "://" | lower -}}
{{- end -}}

{{- define "fireblocks-agent.validate" -}}
{{- if not (and .Values.image.repository (or .Values.image.tag .Values.image.digest)) -}}
{{- fail "image.repository and image.tag (or image.digest) are required (you build and push the Agent image)" -}}
{{- end -}}
{{- $scheme := include "fireblocks-agent.urlScheme" . -}}
{{- if not .Values.customerServer.url -}}
{{- fail "customerServer.url is required: your Customer Server's API, for example https://keylink-flow.<namespace>.svc:5000/api" -}}
{{- end -}}
{{- if not (has $scheme (list "https" "http")) -}}
{{- fail "customerServer.url must start with https:// (http:// only with customerServer.allowInsecureHttp=true): your Customer Server's API, for example https://keylink-flow.<namespace>.svc:5000/api" -}}
{{- end -}}
{{- if not (regexMatch "^(?i:https?)://([^/:\\[\\]\\s]+|\\[[0-9A-Fa-f:.]+\\])(:[0-9]+)?(/\\S*)?$" .Values.customerServer.url) -}}
{{- fail "customerServer.url is not a valid URL: use https://<host>[:<port>]/api, for example https://keylink-flow.<namespace>.svc:5000/api" -}}
{{- end -}}
{{- if and .Values.customerServer.ca.configMap .Values.customerServer.ca.secret -}}
{{- fail "customerServer.ca: set configMap or secret, not both" -}}
{{- end -}}
{{- if and (or .Values.customerServer.ca.configMap .Values.customerServer.ca.secret) (ne $scheme "https") -}}
{{- fail "customerServer.ca is only used with an https:// customerServer.url" -}}
{{- end -}}
{{- if and (eq $scheme "http") (not .Values.customerServer.allowInsecureHttp) -}}
{{- fail "customerServer.url is http://: the Agent refuses to send signing requests and its Authorization key unencrypted. Use https:// (KeyLink Flow serves HTTPS by default), or for a development cluster only set customerServer.allowInsecureHttp=true" -}}
{{- end -}}
{{- if and .Values.customerServer.allowInsecureHttp (eq $scheme "https") -}}
{{- fail "customerServer.allowInsecureHttp is only for an http:// customerServer.url: remove it" -}}
{{- end -}}
{{- if and .Values.pairing.enabled (not .Values.pairing.tokenSecret) -}}
{{- fail "pairing.tokenSecret is required with pairing.enabled: a Secret holding a fresh pairing token" -}}
{{- end -}}
{{- with .Values.networkPolicy.customerServerPort -}}
{{- if not (and (regexMatch "^[1-9][0-9]{0,4}$" (toString .)) (le (int (toString .)) 65535)) -}}
{{- fail (printf "networkPolicy.customerServerPort %q must be a port number: the Customer Server pod's container port" (toString .)) -}}
{{- end -}}
{{- end -}}
{{- if not (has .Values.platform (list "openshift" "kubernetes")) -}}
{{- fail "platform must be openshift or kubernetes" -}}
{{- end -}}
{{- if not (has .Values.pairing.cli (list "" "oc" "kubectl")) -}}
{{- fail "pairing.cli must be oc, kubectl or empty (oc on OpenShift, kubectl elsewhere)" -}}
{{- end -}}
{{- if eq .Values.platform "kubernetes" -}}
{{- $ctx := fromYaml (include "fireblocks-agent.podSecurityContext" .) -}}
{{- if not (and $ctx.runAsNonRoot $ctx.runAsUser) -}}
{{- fail "platform=kubernetes needs runAsNonRoot: true and a non-zero runAsUser in the pods' security context (kubernetes.podSecurityContext or podSecurityContext): nothing assigns a user ID, and the kubectl image runs as root by default" -}}
{{- end -}}
{{- end -}}
{{- include "fireblocks-agent.validateProxy" . -}}
{{- end -}}

{{/*
The pods' security context: podSecurityContext, on top of kubernetes.podSecurityContext with
platform=kubernetes (a key set in podSecurityContext wins). On OpenShift, restricted-v2 assigns the
user ID, so the chart sets none. The KeyLink Flow chart does the same.
*/}}
{{- define "fireblocks-agent.podSecurityContext" -}}
{{- $ctx := deepCopy .Values.podSecurityContext -}}
{{- if eq .Values.platform "kubernetes" -}}
{{- $ctx = mergeOverwrite (deepCopy .Values.kubernetes.podSecurityContext) $ctx -}}
{{- end -}}
{{- toYaml $ctx -}}
{{- end -}}

{{/* The pairing Job's tool for the Kubernetes API: pairing.cli, else oc on OpenShift, kubectl elsewhere. */}}
{{- define "fireblocks-agent.pairingCli" -}}
{{- .Values.pairing.cli | default (ternary "oc" "kubectl" (eq .Values.platform "openshift")) -}}
{{- end -}}

{{/*
One kubectl command of the pairing Job, as a container: dict "name", "args" (kubectl's arguments),
"root" (the chart's context) and "scratch" (true to mount the pairing step's memory-backed volume,
read-only). It gets the service account's API token, like the oc container.
*/}}
{{- define "fireblocks-agent.kubectlStep" -}}
{{- $v := .root.Values -}}
- name: {{ .name }}
  image: {{ include "fireblocks-agent.image" $v.pairing.kubectlImage | quote }}
  imagePullPolicy: {{ $v.pairing.kubectlImage.pullPolicy }}
  command: ["kubectl"]
  args:
    {{- toYaml .args | nindent 4 }}
  securityContext:
    {{- toYaml $v.containerSecurityContext | nindent 4 }}
  resources:
    {{- toYaml $v.helperResources | nindent 4 }}
  env:
    # kubectl's cache directory, on the writable /tmp volume.
    - name: HOME
      value: /tmp
  volumeMounts:
    {{- if .scratch }}
    - name: scratch
      mountPath: /scratch
      readOnly: true
    {{- end }}
    - name: tmp
      mountPath: /tmp
    - name: api-access
      mountPath: /var/run/secrets/kubernetes.io/serviceaccount
      readOnly: true
{{- end -}}

{{/* Cluster DNS ports for the NetworkPolicies: 53, and 5353 on OpenShift, whose DNS pods listen there. */}}
{{- define "fireblocks-agent.dnsEgress" -}}
{{- if eq .Values.platform "openshift" -}}
# Cluster DNS (OpenShift's DNS pods listen on 5353).
{{- else -}}
# Cluster DNS.
{{- end }}
- ports:
    - port: 53
      protocol: UDP
    - port: 53
      protocol: TCP
    {{- if eq .Values.platform "openshift" }}
    - port: 5353
      protocol: UDP
    - port: 5353
      protocol: TCP
    {{- end }}
{{- end -}}

{{/*
Outbound proxy and CA bundle. The KeyLink Flow chart has the same settings, helpers and checks.
*/}}
{{- define "fireblocks-agent.validateProxy" -}}
{{- $p := .Values.proxy -}}
{{- if and $p.url $p.existingSecret -}}
{{- fail "proxy: set url or existingSecret, not both" -}}
{{- end -}}
{{- if $p.url -}}
{{- if not (regexMatch "^https?://[^/@]+(/.*)?$" $p.url) -}}
{{- fail "proxy.url must be http://host:port or https://host:port, without a user name or password: put a URL with credentials in a Secret (proxy.existingSecret)" -}}
{{- end -}}
{{- end -}}
{{- if and $p.existingSecret (not $p.port) -}}
{{- fail "proxy.existingSecret needs proxy.port, for the NetworkPolicy (the URL is in the Secret)" -}}
{{- end -}}
{{- if and (include "fireblocks-agent.proxyEnabled" .) .Values.networkPolicy.enabled (not $p.cidrs) -}}
{{- fail "proxy needs proxy.cidrs (the proxy's addresses) for the NetworkPolicy, which allows egress to the proxy only" -}}
{{- end -}}
{{- if and .Values.caBundle.configMap .Values.caBundle.secret -}}
{{- fail "caBundle: set configMap or secret, not both" -}}
{{- end -}}
{{- if and .Values.pairing.enabled .Values.networkPolicy.enabled (or (include "fireblocks-agent.proxyEnabled" .) .Values.networkPolicy.fireblocksCidrs) (not .Values.pairing.apiServerCidrs) -}}
{{- fail "pairing with a proxy or networkPolicy.fireblocksCidrs needs pairing.apiServerCidrs: without it the pairing Job may reach ports 443 and 6443 on any address, around the proxy or the Fireblocks addresses. List the Kubernetes API server's endpoint addresses (oc get endpoints kubernetes -n default)" -}}
{{- end -}}
{{- end -}}

{{- define "fireblocks-agent.proxyEnabled" -}}
{{- if or .Values.proxy.url .Values.proxy.existingSecret }}true{{ end -}}
{{- end -}}

{{/* The proxy's port: proxy.port, else the port in proxy.url, else 443 for https and 80 for http.
Same as the KeyLink Flow chart's keylink-flow.proxyPort, IPv6 addresses included. */}}
{{- define "fireblocks-agent.proxyPort" -}}
{{- if .Values.proxy.port -}}
{{- .Values.proxy.port -}}
{{- else -}}
{{- $u := urlParse .Values.proxy.url -}}
{{- $port := regexFind ":[0-9]+$" (regexReplaceAll "^\\[[^]]*\\]" $u.host "") -}}
{{- if $port }}{{ trimPrefix ":" $port }}{{ else }}{{ ternary 443 80 (eq $u.scheme "https") }}{{ end -}}
{{- end -}}
{{- end -}}

{{/* Environment for the outbound proxy and the CA bundle. File paths only for the proxy Secret. */}}
{{- define "fireblocks-agent.proxyEnv" -}}
{{- $p := .Values.proxy -}}
{{- if $p.existingSecret }}
- name: HTTPS_PROXY_FILE
  value: "/run/secrets/fireblocks-agent-proxy/{{ $p.secretKey }}"
- name: HTTP_PROXY_FILE
  value: "/run/secrets/fireblocks-agent-proxy/{{ $p.secretKey }}"
{{- else if $p.url }}
- name: HTTPS_PROXY
  value: {{ $p.url | quote }}
- name: HTTP_PROXY
  value: {{ $p.url | quote }}
{{- end }}
{{- if include "fireblocks-agent.proxyEnabled" . }}
- name: NO_PROXY
  value: {{ include "fireblocks-agent.noProxy" . | quote }}
{{- end }}
{{- if or .Values.caBundle.configMap .Values.caBundle.secret }}
- name: NODE_EXTRA_CA_CERTS
  value: "/run/fireblocks-agent-ca-bundle/{{ .Values.caBundle.key }}"
{{- end }}
{{- end -}}

{{- define "fireblocks-agent.noProxy" -}}
{{- $extra := list -}}
{{- range splitList "," .Values.proxy.noProxy }}{{ with trim . }}{{ $extra = append $extra . }}{{ end }}{{ end -}}
{{- concat (list "localhost" "127.0.0.1" ".svc" ".cluster.local") $extra | uniq | join "," -}}
{{- end -}}

{{- define "fireblocks-agent.proxyVolumeMounts" -}}
{{- if .Values.proxy.existingSecret }}
- name: proxy
  mountPath: /run/secrets/fireblocks-agent-proxy
  readOnly: true
{{- end }}
{{- if or .Values.caBundle.configMap .Values.caBundle.secret }}
- name: ca-bundle
  mountPath: /run/fireblocks-agent-ca-bundle
  readOnly: true
{{- end }}
{{- end -}}

{{- define "fireblocks-agent.proxyVolumes" -}}
{{- if .Values.proxy.existingSecret }}
- name: proxy
  secret:
    secretName: {{ .Values.proxy.existingSecret }}
    defaultMode: 0440
    items:
      - key: {{ .Values.proxy.secretKey }}
        path: {{ .Values.proxy.secretKey }}
{{- end }}
{{- with .Values.caBundle }}
{{- if or .configMap .secret }}
- name: ca-bundle
  {{- if .configMap }}
  configMap:
    name: {{ .configMap }}
  {{- else }}
  secret:
    secretName: {{ .secret }}
    defaultMode: 0440
  {{- end }}
    items:
      - key: {{ .key }}
        path: {{ .key }}
{{- end }}
{{- end }}
{{- end -}}


{{/* Egress to Fireblocks: the proxy only when one is set, otherwise port 443 (to fireblocksCidrs when listed). */}}
{{- define "fireblocks-agent.fireblocksEgress" -}}
{{- if include "fireblocks-agent.proxyEnabled" . -}}
# Fireblocks, through the outbound proxy only.
- to:
    {{- range .Values.proxy.cidrs }}
    - ipBlock:
        cidr: {{ . }}
    {{- end }}
  ports:
    - port: {{ include "fireblocks-agent.proxyPort" . }}
      protocol: TCP
{{- else -}}
# Fireblocks over HTTPS and WebSocket Secure.
- ports:
    - port: 443
      protocol: TCP
  {{- with .Values.networkPolicy.fireblocksCidrs }}
  to:
    {{- range . }}
    - ipBlock:
        cidr: {{ . }}
    {{- end }}
  {{- end }}
{{- end -}}
{{- end -}}
