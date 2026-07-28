#!/usr/bin/env bash
#
# Luna HSM client entrypoint for the KeyLink customer-server example (Thales, Phase 3).
#
# On container start: if the Luna client is installed AND Luna credentials are present
# in the environment, register this client with the Luna Network HSM appliance
# (idempotent) and verify partition visibility, then hand off to the customer server.
# With no LUNA_HOST (e.g. SoftHSM mode) the Luna steps are skipped entirely.
#
# Registration env (supplied at RUN time by the coordinator, e.g. via --env-file):
#   LUNA_HOST                Appliance hostname/IP  (NTLS, TCP 1792)
#   LUNA_APPLIANCE_USER      Appliance admin-role user (typically "admin")
#   LUNA_APPLIANCE_PASSWORD  Appliance admin-role password           (never logged)
#   LUNA_PARTITION           Partition (token) label to register/use
#   LUNA_CLIENT_NAME         This client's registered name on the appliance
#
# Runtime PKCS#11 env consumed by the app (src/services/hsm-facade.ts):
#   HSM_MODULE=/usr/safenet/lunaclient/lib/libCryptoki2_64.so
#   HSM_PIN=<partition Crypto Officer password>
#   HSM_SLOT_LABEL=<Luna partition label>
#
set -euo pipefail

LUNA_BASE="/usr/safenet/lunaclient"
LUNACM="${LUNA_BASE}/bin/lunacm"
VTL="${LUNA_BASE}/bin/vtl"

# Luna tools locate Chrystoki.conf via this directory (root install → /etc/Chrystoki.conf).
export ChrystokiConfigurationPath="${ChrystokiConfigurationPath:-/etc}"

log() { printf '[luna-entrypoint] %s\n' "$*"; }

# Purely local check (no appliance connection): are we already registered?
#   - a stored appliance server certificate, or
#   - a non-empty trusted-server list from `vtl listServers`
#     ("Server: <host>" per entry; "There are no servers registered." when empty).
luna_registered() {
    if ls "${LUNA_BASE}"/cert/server/* >/dev/null 2>&1; then
        return 0
    fi
    if [[ -x "${VTL}" ]] && "${VTL}" listServers 2>/dev/null | grep -q "Server:"; then
        return 0
    fi
    return 1
}

register_luna() {
    # Fail fast with a clear message if any required var is missing/empty.
    local missing=()
    local v
    for v in LUNA_HOST LUNA_APPLIANCE_USER LUNA_APPLIANCE_PASSWORD LUNA_PARTITION LUNA_CLIENT_NAME; do
        [[ -n "${!v:-}" ]] || missing+=("${v}")
    done
    if [[ ${#missing[@]} -gt 0 ]]; then
        log "ERROR: Luna registration requested (LUNA_HOST set) but missing env: ${missing[*]}"
        exit 1
    fi

    log "Registering Luna client '${LUNA_CLIENT_NAME}' with appliance '${LUNA_HOST}' (partition '${LUNA_PARTITION}', user '${LUNA_APPLIANCE_USER}')..."
    # Invocation matches the proven working form from keylink-flow MR !35:
    #   lunacm -q clientconfig deploy -server … -user … -password … -client … -partition … -force
    # Notes (verified against Luna Client v10.9.3-43):
    #   * You MUST run the command as `lunacm -q <command>` (or -c). Bare positional args are
    #     rejected ("Unknown command-line arguments"); `lunacm -c "clientconfig deploy …"` is
    #     ALSO rejected ("0x1 Unknown command" — -c cannot take a multi-token subcommand).
    #     `-q` runs the command with the banner suppressed.
    #   * Because the password is passed as its own argv element (shell-tokenized), lunacm
    #     receives it verbatim — values containing '$' are safe here (eLab passwords contain
    #     '$', e.g. the doc's own example "J0inThal3$"). It is never echoed by this script.
    #   * -force accepts/stores the appliance host key in cache on first connect.
    if "${LUNACM}" -q clientconfig deploy \
        -server "${LUNA_HOST}" -user "${LUNA_APPLIANCE_USER}" \
        -password "${LUNA_APPLIANCE_PASSWORD}" -client "${LUNA_CLIENT_NAME}" \
        -partition "${LUNA_PARTITION}" -force; then
        log "'clientconfig deploy' completed."
    else
        log "ERROR: 'clientconfig deploy' could not connect to the appliance."
        log "  DNS + TCP (22/1792/8443) reaching the appliance is NOT sufficient — if this"
        log "  still fails, the usual cause is that this client's PUBLIC egress IP is not"
        log "  whitelisted in the eLab firewall. Register your public IP with the Thales"
        log "  Sales Engineer ('eLab Getting started setup' doc, sections 3 and 4.3)."
        exit 1
    fi
}

if [[ -x "${LUNACM}" && -n "${LUNA_HOST:-}" ]]; then
    if luna_registered; then
        log "Luna client already registered; skipping 'clientconfig deploy'."
    else
        register_luna
    fi

    # Confirm the partition/slot is visible. Non-fatal: log the outcome and let the app
    # surface a precise PKCS#11 error on login if something is still wrong.
    log "Verifying Luna partition visibility ('vtl verify')..."
    if "${VTL}" verify; then
        log "'vtl verify' OK."
    else
        log "WARNING: 'vtl verify' reported a problem; check LUNA_* values and appliance reachability (NTLS TCP 1792)."
    fi
else
    log "Luna client absent or LUNA_HOST unset; skipping Luna registration (SoftHSM / pre-registered mode)."
fi

log "Starting customer server: $*"
exec "$@"
