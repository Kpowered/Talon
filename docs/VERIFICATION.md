# Talon Verification

## Last updated
2026-03-07

## Goal
Track what was actually verified in the current environment, what transcripts were captured, and which constraints still block full incident-path validation.

## Completed checks

### Backend compile check

Command:

```powershell
cargo check
```

Result:

- Passed in `apps/desktop/src-tauri`

### Desktop frontend build

Command:

```powershell
cmd /c npm --prefix apps/desktop run build
```

Result:

- Passed
- Current production bundle built successfully through Vite

### Local SSH reachability probe

Command:

```powershell
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 localhost exit
```

Transcript:

```text
banner exchange: Connection to UNKNOWN port -1: Connection refused
```

Interpretation:

- The current machine does not expose a reachable local SSH target for Talon to connect to.
- This is sufficient to validate the new network-path error classification and operator-visible issue rendering.
- It is not sufficient to validate the happy-path shell bootstrap, command framing, or live failure packaging against a successful SSH session.

### Local OpenSSH service state

Command:

```powershell
Get-Service sshd,ssh-agent | Format-Table -Auto Name,Status,StartType
```

Transcript:

```text
Name       Status StartType
----       ------ ---------
ssh-agent Stopped  Disabled
sshd      Stopped    Manual
```

Interpretation:

- `ssh-agent` is disabled.
- `sshd` is installed but currently stopped.
- No operator-approved reachable SSH target was available in this session.

### External password-auth SSH target probe

Command class:

```powershell
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password ...
```

Validation notes:

- Used an operator-provided external test host
- Host details are intentionally redacted from the repository copy of this log
- Password auth was supplied through a local `SSH_ASKPASS` helper for validation only

Observed handshake facts:

- Remote banner: `OpenSSH_10.0p2 Debian-7`
- Host key type: `ssh-ed25519`
- Host fingerprint observed during handshake: `SHA256:ukhO4ajPmXkoP5b0dh0VX5f/RE6BLy/2OAjpBOY/4Ws`
- Supported auth methods reported by the server: `publickey,password`

Bootstrap transcript:

```text
/root
root
/bin/bash
```

Interpretation:

- The external test target is reachable from this machine.
- Password authentication works for the operator-provided account.
- The remote shell bootstrap expectations were satisfied:
  - cwd resolved
  - remote user resolved
  - shell resolved

### External non-zero exit probe

Command class:

```powershell
ssh ... 'sh -c "exit 7"'
```

Transcript:

```text
LOCAL_SSH_EXIT=7
```

Interpretation:

- A real remote non-zero exit was observed through the SSH client path.
- This validates the environment needed for end-to-end non-zero exit testing against a reachable host.
- Talon still needs product-integrated password auth before this exact host can be exercised from the desktop workflow instead of an external validation probe.

## Verified product behavior in this environment

- Rust backend compiles with the current real SSH transport, disconnect/reconnect flow, and in-flight command guardrails.
- Desktop frontend builds with the current Tauri command surface and `@talon/core` path alias wiring.
- Talon can now classify and surface connection-path failures for:
  - host trust / host key issues
  - authentication failures
  - connection timeouts
  - network path failures such as connection refused or hostname resolution errors
- External validation confirmed that a reachable password-auth host can be contacted from this machine and can return a controlled non-zero exit.

## Not yet verified end to end

- Successful SSH connection to a reachable target
- Remote shell bootstrap on a live host
- Command start/end framing against a real remote shell
- Non-zero exit capture from a live incident command on a reachable host
- Transcript capture from a real remote failure session
- The desktop product path against a password-auth host, because Talon's backend transport still does not consume password credentials directly

## Next verification target

Use an operator-approved SSH host with:

- a known hostname or IP
- an accepted host key path
- agent or private-key auth available
- a safe read-only command set for validation

Suggested first probe:

```powershell
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes <user>@<host> "pwd && whoami && echo ${SHELL:-sh}"
```
