#!/usr/bin/env bash
# cult.sh - sermon engine for GET_TO_WORK (leader and follower side). No daemon.
# Atomic primitives only: mkdir (pulpit lock, worklock), noclobber (claims, FOLLOWER files),
# awk rewrite under the pulpit lock. Run `bash cult.sh help` for commands.
set -u
GTW="${GTW:-documents/github-yubios-KS9n5GAT/GET_TO_WORK}"
MAXSLOTS="${MAXSLOTS:-10}"
WORKLOCK_STALE="${WORKLOCK_STALE:-900}"
SID="${SAUNA_SESSION_ID:-$(whoami)-$$}"
PULPIT_LOCK="$GTW/.pulpit.lock"
HOLD=0
ts()  { date -u +%Y-%m-%dT%H:%M:%SZ; }
now() { date +%s; }
die() { echo "$1" >&2; exit "${2:-1}"; }
release() { if [ "$HOLD" = 1 ]; then rmdir "$PULPIT_LOCK" 2>/dev/null; HOLD=0; fi; }
trap release EXIT
need() { [ -f "$GTW/CULT_LEADER.md" ] || die "NOT-INITIALIZED: $GTW/CULT_LEADER.md missing" 3; }
fnum() { case "${1:-}" in ''|*[!0-9]*) die "BAD-SLOT: '${1:-}' is not a slot number" 2;; esac; }
ffile() { echo "$GTW/FOLLOWER_$1.md"; }
plock() {
  local i=0
  while ! mkdir "$PULPIT_LOCK" 2>/dev/null; do
    i=$((i+1)); [ "$i" -gt 120 ] && die "PULPIT-LOCKED: $PULPIT_LOCK held over 60s" 4
    sleep 0.5
  done
  HOLD=1
}
punlock() { release; }

cmd_init() {
  mkdir -p "$GTW/scripts" "$GTW/proposals" "$GTW/.claims" "$GTW/.work" "$GTW/.hb" "$GTW/source" "$GTW/build"
  touch "$GTW/.checkin_board"
  echo "OK init $GTW"
}

cmd_seed() {
  fnum "${1:-}"; local n="$1" f; f=$(ffile "$n")
  if ( set -C; printf '# FOLLOWER_%s\n\nslot: %s\nseeded: %s\n\n## Inbox\n\n## Outbox\n' "$n" "$n" "$(ts)" > "$f" ) 2>/dev/null; then
    echo "SEEDED $f"
  else
    echo "EXISTS $f"
  fi
}

cmd_claim() {
  need
  if [ -n "${1:-}" ]; then
    fnum "$1"; local n="$1"
    [ -f "$(ffile "$n")" ] || cmd_seed "$n" >/dev/null
    if ( set -C; echo "$SID $(ts)" > "$GTW/.claims/$n" ) 2>/dev/null; then echo "$n"; return 0; fi
    die "SLOT-TAKEN: FOLLOWER_$n already claimed by $(cat "$GTW/.claims/$n" 2>/dev/null)" 5
  fi
  local i
  for i in $(seq 1 "$MAXSLOTS"); do
    [ -f "$(ffile "$i")" ] || cmd_seed "$i" >/dev/null
    if ( set -C; echo "$SID $(ts)" > "$GTW/.claims/$i" ) 2>/dev/null; then echo "$i"; return 0; fi
  done
  die "NO-FREE-SLOT" 5
}

cmd_checkin() {
  need; fnum "${1:-}"; local n="$1"; shift; local msg="${*:-present}"
  [ -f "$(ffile "$n")" ] || die "NO-FILE: $(ffile "$n")" 3
  now > "$GTW/.hb/$n"
  echo "$(ts) FOLLOWER_$n $msg" >> "$GTW/.checkin_board"
  echo "OK checkin $n"
}

cmd_worklock() {
  need; fnum "${1:-}"; local n="$1" d="$GTW/.work/$1"
  if [ -d "$d" ]; then
    local age=$(( $(now) - $(stat -c %Y "$d" 2>/dev/null || echo 0) ))
    if [ "$age" -ge "$WORKLOCK_STALE" ]; then echo "BUSY-STALE holder=$(cat "$d/holder" 2>/dev/null) age=${age}s"; return 2; fi
    echo "BUSY holder=$(cat "$d/holder" 2>/dev/null) age=${age}s"; return 2
  fi
  mkdir "$d" 2>/dev/null || { echo "BUSY race"; return 2; }
  echo "$SID $(ts)" > "$d/holder"
  echo "OK"
}

cmd_workunlock() {
  need; fnum "${1:-}"
  rm -rf "$GTW/.work/$1"
  echo "OK"
}

cmd_report() {
  need; fnum "${1:-}"; local n="$1"; shift; local msg="$*"
  [ -d "$GTW/.work/$n" ] || die "NO-WORKLOCK: refuse report without a held worklock (run: worklock $n first)" 6
  local f; f=$(ffile "$n"); [ -f "$f" ] || die "NO-FILE: $f" 3
  printf -- '- %s %s\n' "$(ts)" "$msg" >> "$f"
  echo "OK report $n"
}

cmd_assign() {
  need; fnum "${1:-}"; local n="$1"; shift; local text="$*"
  [ -n "$text" ] || die "EMPTY-TASK" 2
  local tok; tok=$(printf '%s' "$text" | grep -oE 'T[0-9]+|#[0-9]+' | head -1)
  plock
  if [ -n "$tok" ]; then
    local other on
    for other in "$GTW"/FOLLOWER_*.md; do
      [ -f "$other" ] || continue
      on=$(basename "$other" .md); on=${on#FOLLOWER_}
      [ "$on" = "$n" ] && continue
      if grep -E '^- \[ \] ' "$other" | grep -qE "(^|[^A-Za-z0-9])${tok}([^0-9]|\$)"; then
        echo "ASSIGNED-ELSEWHERE: $tok is open in FOLLOWER_$on"; punlock; return 1
      fi
    done
  fi
  local f; f=$(ffile "$n")
  TASK="$text" awk '
    BEGIN { inb = 0; ins = 0; t = ENVIRON["TASK"] }
    /^## Inbox/ { inb = 1; print; next }
    inb && /^## / { print "- [ ] " t; print ""; inb = 0; ins = 1 }
    { print }
    END { if (!ins) print "- [ ] " t }
  ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  punlock
  echo "OK assign $n ${tok:-no-token}"
}

cmd_markdone() {
  need; fnum "${1:-}"; local n="$1"; shift; local tok="$*"
  [ -n "$tok" ] || die "NEED-TOKEN" 2
  plock
  local f; f=$(ffile "$n")
  TOK="$tok" awk '{ if ($0 ~ /^- \[ \] / && index($0, ENVIRON["TOK"]) > 0) sub(/^- \[ \] /, "- [x] "); print }' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  punlock
  echo "OK markdone $n $tok"
}

cmd_post() {
  need
  local from="${1:-?}" to="${2:-?}"; shift 2 2>/dev/null || true
  local msg="$*"
  plock
  grep -q '^## CROSS-TALK' "$GTW/CULT_LEADER.md" || printf '\n## CROSS-TALK\n' >> "$GTW/CULT_LEADER.md"
  printf -- '- %s **%s -> %s**: %s\n' "$(ts)" "$from" "$to" "$msg" >> "$GTW/CULT_LEADER.md"
  punlock
  echo "OK post"
}

cmd_set_status() {
  need; local text="$*"
  plock
  TXT="$text" awk 'BEGIN { d = 0 }
    /^Sermon status:/ && !d { print "Sermon status: " ENVIRON["TXT"]; d = 1; next }
    { print }
    END { if (!d) print "Sermon status: " ENVIRON["TXT"] }' "$GTW/CULT_LEADER.md" > "$GTW/CULT_LEADER.md.tmp" && mv "$GTW/CULT_LEADER.md.tmp" "$GTW/CULT_LEADER.md"
  punlock
  echo "OK status"
}

cmd_sermon_end() {
  need; local msg="$*"
  plock
  if ! grep -q '^## Sermon ended' "$GTW/CULT_LEADER.md"; then
    printf '\n## Sermon ended\n- %s %s\n' "$(ts)" "$msg" >> "$GTW/CULT_LEADER.md"
  fi
  punlock
  echo "OK sermon-end"
}

cmd_roster() {
  need
  printf '%-5s %-8s %-9s %-6s %s\n' SLOT CLAIMED HB_AGE OPEN LAST_OUTBOX
  local f n claimed age open last
  for f in "$GTW"/FOLLOWER_*.md; do
    [ -f "$f" ] || continue
    n=$(basename "$f" .md); n=${n#FOLLOWER_}
    if [ -f "$GTW/.claims/$n" ]; then claimed=yes; else claimed=no; fi
    if [ -f "$GTW/.hb/$n" ]; then age="$(( $(now) - $(cat "$GTW/.hb/$n") ))s"; else age=never; fi
    open=$(awk '/^## Inbox/ { i = 1; next } /^## / { i = 0 } i && /^- \[ \] / { c++ } END { print c + 0 }' "$f")
    last=$(awk '/^## Outbox/ { o = 1; next } o && /^- / { l = $0 } END { print substr(l, 1, 110) }' "$f")
    printf '%-5s %-8s %-9s %-6s %s\n' "$n" "$claimed" "$age" "$open" "$last"
  done
}

cmd_status() {
  need
  grep -m1 '^Sermon status:' "$GTW/CULT_LEADER.md" || echo "Sermon status: (unset)"
  if grep -q '^## Sermon ended' "$GTW/CULT_LEADER.md"; then echo "SERMON-ENDED marker present"; else echo "sermon open"; fi
  cmd_roster
}

cmd_clear_board() { : > "$GTW/.checkin_board"; echo "OK clear-board"; }

cmd_lock() { mkdir "$PULPIT_LOCK" 2>/dev/null && echo OK || echo "LOCKED"; }
cmd_unlock() { rmdir "$PULPIT_LOCK" 2>/dev/null && echo OK || echo "NOT-LOCKED"; }

usage() {
  cat <<'USAGE'
cult.sh - GET_TO_WORK sermon engine
  init                          create folders (idempotent)
  seed N                        create FOLLOWER_N.md if absent (leader)
  claim [N]                     claim slot N (or lowest free); prints N
  checkin N "msg"               heartbeat to .checkin_board and .hb/N
  worklock N | workunlock N     per-slot work lock (BUSY if held <15 min)
  report N "msg"                append to FOLLOWER_N Outbox (needs worklock)
  assign N "task"               append "- [ ] task" to FOLLOWER_N Inbox (T-id guard)
  markdone N TOKEN              flip open "- [ ]" lines containing TOKEN to "- [x]"
  post FROM TO "msg"            cross-talk line in CULT_LEADER.md
  set-status "text"             rewrite the "Sermon status:" line (leader)
  sermon-end "msg"              append "## Sermon ended" marker (leader)
  roster | status               slot table / pulpit status
  clear-board | lock | unlock   housekeeping
USAGE
}

case "${1:-help}" in
  init) shift; cmd_init "$@";;
  seed) shift; cmd_seed "$@";;
  claim) shift; cmd_claim "$@";;
  checkin) shift; cmd_checkin "$@";;
  worklock) shift; cmd_worklock "$@";;
  workunlock) shift; cmd_workunlock "$@";;
  report) shift; cmd_report "$@";;
  assign) shift; cmd_assign "$@";;
  markdone) shift; cmd_markdone "$@";;
  post) shift; cmd_post "$@";;
  set-status) shift; cmd_set_status "$@";;
  sermon-end) shift; cmd_sermon_end "$@";;
  roster) cmd_roster;;
  status) cmd_status;;
  clear-board) cmd_clear_board;;
  lock) cmd_lock;;
  unlock) cmd_unlock;;
  help|-h|--help) usage;;
  *) echo "unknown command: $1" >&2; usage; exit 2;;
esac
