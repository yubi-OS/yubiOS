#!/usr/bin/env python3
"""Protection-switch state-space verifier, io.yubios.Attest Varlink service,
and WIMSE RFC 9421 Workload-Identity-Token signer for yubiOS mutual attestation.

Modeled on:
  - brauner/linux-formal (protection-switch model checking)
  - systemd/varlink-http-bridge & mvo5/systemd-mcp (/run/varlink/registry IDL)
  - amutable/quarry/internal/wimseagent (draft-ietf-wimse-http-signature-08)
"""

from __future__ import annotations

import base64
from collections import deque
from dataclasses import dataclass
import hashlib
import hmac
import itertools
import json
import sys
import time
from typing import Any


VARLINK_INTERFACE_IDL = """interface io.yubios.Attest

type AttestationState (
  phase: string,
  firmware_clean: bool,
  pk_enrolled: bool,
  composefs_verified: bool,
  fido2_touch_present: bool,
  ftpm_quote_valid: bool,
  composefs_digest: string
)

type WorkloadIdentityToken (
  wit: string,
  signature_input: string,
  signature: string,
  audience: string,
  expires_at: int
)

method Describe() -> (state: AttestationState)
method SignWorkloadIdentityToken(audience: string, method: string, path: string) -> (token: WorkloadIdentityToken)
error GateViolation (gate: string, reason: string)
"""

SWITCH_NAMES = (
    "SwitchChipsecGate",
    "SwitchSetupModeCheck",
    "SwitchComposefsDigestCheck",
    "SwitchFido2PinTouch",
    "SwitchFtpmQuoteBind",
)


@dataclass(frozen=True)
class ModelState:
    phase: str
    firmware_clean: bool
    pk_enrolled: bool
    composefs_verified: bool
    fido2_touch_present: bool
    ftpm_quote_valid: bool


def explore_protection_switches(switches: dict[str, bool]) -> dict[str, Any]:
    """Exhaustively explore the YubiOSEnrollAttest state space via BFS."""
    initial_states = [
        ModelState("UnenrolledBoot", fc, pk, cf, f2, ft)
        for fc, pk, cf, f2, ft in itertools.product([False, True], repeat=5)
    ]
    visited: set[ModelState] = set(initial_states)
    parent: dict[ModelState, tuple[ModelState | None, str]] = {
        s: (None, "Init") for s in initial_states
    }
    queue: deque[ModelState] = deque(initial_states)
    violation_trace: list[dict[str, Any]] | None = None

    while queue:
        cur = queue.popleft()
        if cur.phase == "MutualAttested":
            if not (
                cur.firmware_clean
                and cur.pk_enrolled
                and cur.composefs_verified
                and cur.fido2_touch_present
                and cur.ftpm_quote_valid
            ):
                # Reconstruct counterexample trace
                trace = []
                node: ModelState | None = cur
                while node is not None:
                    prev, act = parent[node]
                    trace.append({"action": act, "phase": node.phase, "state": node.__dict__})
                    node = prev
                trace.reverse()
                violation_trace = trace
                break

        next_states: list[tuple[str, ModelState]] = []
        if cur.phase == "UnenrolledBoot":
            if (not switches["SwitchChipsecGate"]) or cur.firmware_clean:
                next_states.append(("PassChipsec", ModelState("ChipsecChecked", cur.firmware_clean, cur.pk_enrolled, cur.composefs_verified, cur.fido2_touch_present, cur.ftpm_quote_valid)))
        elif cur.phase == "ChipsecChecked":
            if (not switches["SwitchSetupModeCheck"]) or cur.pk_enrolled:
                next_states.append(("EnrollSecureBoot", ModelState("SecureBootEnrolled", cur.firmware_clean, cur.pk_enrolled, cur.composefs_verified, cur.fido2_touch_present, cur.ftpm_quote_valid)))
        elif cur.phase == "SecureBootEnrolled":
            if (not switches["SwitchComposefsDigestCheck"]) or cur.composefs_verified:
                next_states.append(("MountComposefs", ModelState("ComposefsMounted", cur.firmware_clean, cur.pk_enrolled, cur.composefs_verified, cur.fido2_touch_present, cur.ftpm_quote_valid)))
        elif cur.phase == "ComposefsMounted":
            if (not switches["SwitchFido2PinTouch"]) or cur.fido2_touch_present:
                next_states.append(("UnlockLuksFido2", ModelState("LuksFido2Unlocked", cur.firmware_clean, cur.pk_enrolled, cur.composefs_verified, cur.fido2_touch_present, cur.ftpm_quote_valid)))
        elif cur.phase == "LuksFido2Unlocked":
            if (not switches["SwitchFtpmQuoteBind"]) or cur.ftpm_quote_valid:
                next_states.append(("CompleteMutualAttest", ModelState("MutualAttested", cur.firmware_clean, cur.pk_enrolled, cur.composefs_verified, cur.fido2_touch_present, cur.ftpm_quote_valid)))

        for act, nxt in next_states:
            if nxt not in visited:
                visited.add(nxt)
                parent[nxt] = (cur, act)
                queue.append(nxt)

    return {
        "switches": switches,
        "states_explored": len(visited),
        "invariant_holds": violation_trace is None,
        "counterexample": violation_trace,
    }


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def mint_wimse_wit_headers(
    *,
    node_id: str,
    audience: str,
    http_method: str,
    http_path: str,
    secret_key: bytes,
    now_epoch: int | None = None,
    ttl_seconds: int = 120,
) -> dict[str, Any]:
    """Mint a WIMSE draft-08 Workload-Identity-Token and RFC 9421 HTTP signature."""
    if not audience or not node_id:
        raise ValueError("node_id and audience are required")
    created = int(time.time()) if now_epoch is None else int(now_epoch)
    expires = created + ttl_seconds
    header = {"alg": "HS256", "typ": "wit+jwt"}
    payload = {
        "iss": f"varlink:io.yubios.Attest:{node_id}",
        "sub": node_id,
        "aud": audience,
        "iat": created,
        "exp": expires,
    }
    signing_input = f"{_b64url(json.dumps(header, sort_keys=True, separators=(',', ':')).encode())}.{_b64url(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode())}"
    wit_sig = _b64url(hmac.new(secret_key, signing_input.encode("ascii"), hashlib.sha256).digest())
    wit_token = f"{signing_input}.{wit_sig}"

    sig_params = (
        f'("@method" "@path" "workload-identity-token");'
        f'created={created};expires={expires};tag="wimse-workload-to-workload"'
    )
    signature_base = "\n".join(
        [
            f'"@method": {http_method.upper()}',
            f'"@path": {http_path}',
            f'"workload-identity-token": {wit_token}',
            f'"@signature-params": {sig_params}',
        ]
    )
    req_sig = base64.b64encode(
        hmac.new(secret_key, signature_base.encode("utf-8"), hashlib.sha256).digest()
    ).decode("ascii")
    return {
        "Workload-Identity-Token": wit_token,
        "Signature-Input": f"wimse={sig_params}",
        "Signature": f"wimse=:{req_sig}:",
        "audience": audience,
        "created": created,
        "expires": expires,
    }


def handle_varlink_call(
    request: dict[str, Any], state: ModelState, composefs_digest: str, secret_key: bytes
) -> dict[str, Any]:
    """Handle one Varlink request on io.yubios.Attest."""
    method = request.get("method", "")
    params = request.get("parameters") or {}
    if method == "org.varlink.service.GetInterfaceDescription":
        return {"parameters": {"description": VARLINK_INTERFACE_IDL}}
    if method == "io.yubios.Attest.Describe":
        return {
            "parameters": {
                "state": {
                    "phase": state.phase,
                    "firmware_clean": state.firmware_clean,
                    "pk_enrolled": state.pk_enrolled,
                    "composefs_verified": state.composefs_verified,
                    "fido2_touch_present": state.fido2_touch_present,
                    "ftpm_quote_valid": state.ftpm_quote_valid,
                    "composefs_digest": composefs_digest,
                }
            }
        }
    if method == "io.yubios.Attest.SignWorkloadIdentityToken":
        if state.phase != "MutualAttested":
            return {
                "error": "io.yubios.Attest.GateViolation",
                "parameters": {
                    "gate": state.phase,
                    "reason": "Node has not completed mutual StrongBox attestation",
                },
            }
        headers = mint_wimse_wit_headers(
            node_id=params.get("node_id", "rock5b-enrolled"),
            audience=params["audience"],
            http_method=params.get("method", "GET"),
            http_path=params.get("path", "/update/1.root.json"),
            secret_key=secret_key,
            now_epoch=params.get("now_epoch", 1763856000),
        )
        return {
            "parameters": {
                "token": {
                    "wit": headers["Workload-Identity-Token"],
                    "signature_input": headers["Signature-Input"],
                    "signature": headers["Signature"],
                    "audience": headers["audience"],
                    "expires_at": headers["expires"],
                }
            }
        }
    return {"error": "org.varlink.service.MethodNotFound", "parameters": {"method": method}}


def run_selftest() -> int:
    # 1. All 5 protection switches ON -> invariant holds across all 63 reachable states (32+16+8+4+2+1)
    all_on = {k: True for k in SWITCH_NAMES}
    res_on = explore_protection_switches(all_on)
    assert res_on["invariant_holds"] is True, f"Expected invariant to hold: {res_on}"
    assert res_on["states_explored"] == 63, f"Expected 63 reachable states, got {res_on['states_explored']}"

    # 2. Flip each single protection switch OFF -> TLC/BFS must find a counterexample trace of length 6
    for sw in SWITCH_NAMES:
        mutated = dict(all_on)
        mutated[sw] = False
        res_off = explore_protection_switches(mutated)
        assert res_off["invariant_holds"] is False, f"Switch {sw}=False failed to trigger violation"
        assert res_off["counterexample"] is not None
        assert res_off["counterexample"][-1]["phase"] == "MutualAttested"

    # 3. Varlink IDL introspection + Describe + WIMSE WIT minting & gate rejection
    key = b"yubios-strongbox-session-secret-32b"
    attested_state = ModelState("MutualAttested", True, True, True, True, True)
    unattested_state = ModelState("ComposefsMounted", True, True, True, False, False)

    idl_resp = handle_varlink_call(
        {"method": "org.varlink.service.GetInterfaceDescription"},
        attested_state,
        "v1-sha512-12:deadbeef",
        key,
    )
    assert "interface io.yubios.Attest" in idl_resp["parameters"]["description"]

    denied = handle_varlink_call(
        {
            "method": "io.yubios.Attest.SignWorkloadIdentityToken",
            "parameters": {"audience": "https://updates.yubios.org"},
        },
        unattested_state,
        "v1-sha512-12:deadbeef",
        key,
    )
    assert denied.get("error") == "io.yubios.Attest.GateViolation"

    granted = handle_varlink_call(
        {
            "method": "io.yubios.Attest.SignWorkloadIdentityToken",
            "parameters": {
                "audience": "https://updates.yubios.org",
                "method": "GET",
                "path": "/update/targets.json",
                "now_epoch": 1763856000,
            },
        },
        attested_state,
        "v1-sha512-12:deadbeef",
        key,
    )
    tok = granted["parameters"]["token"]
    assert tok["wit"].count(".") == 2
    assert 'tag="wimse-workload-to-workload"' in tok["signature_input"]
    assert tok["expires_at"] == 1763856120
    print(
        "PASS: YubiOSEnrollAttest 5-switch model (63 states, 5/5 switch-negation traces) "
        "& io.yubios.Attest Varlink + WIMSE RFC 9421 WIT self-test verified"
    )
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        raise SystemExit(run_selftest())
    raise SystemExit(run_selftest())
