#!/bin/bash
# AI Terminal SSH Helper - Enables shell integration over SSH

aiterm_ssh() {
    # Only run when user calls aiterm_ssh inside AI Terminal
    if [ "$TERM_PROGRAM" != "aiterminal" ]; then 
        command ssh "$@"
        return $?
    fi

    local helper_path="$HOME/.config/aiterminal/bash_init.sh"
    local orig_args=("$@")
    
    if [ ${#orig_args[@]} -eq 0 ]; then
        printf '%s\n' "usage: aiterm_ssh destination [command [argument ...]]"
        return 2
    fi
    
    local inline_script=""
    if [ -f "$helper_path" ]; then
        inline_script="$(cat "$helper_path")"
    elif [ -n "$__AITERM_INLINE_CACHE" ]; then
        inline_script="$__AITERM_INLINE_CACHE"
    else
        command ssh "${orig_args[@]}"
        return $?
    fi

    # Detect target and remote command
    local target=""
    local remote_cmd_present=0
    set -- "$@"
    
    while [ $# -gt 0 ]; do
        case "$1" in
            -o|-J|-F|-i|-b|-c|-D|-E|-e|-I|-L|-l|-m|-O|-p|-P|-Q|-R|-S|-W|-w|-B)
                shift
                [ $# -gt 0 ] && shift
                ;;
            -o*|-J*|-F*|-i*|-b*|-c*|-D*|-E*|-e*|-I*|-L*|-l*|-m*|-O*|-p*|-P*|-Q*|-R*|-S*|-W*|-w*|-B*)
                shift
                ;;
            --)
                shift
                if [ $# -gt 0 ]; then
                    target="$1"
                    shift
                fi
                [ $# -gt 0 ] && remote_cmd_present=1
                break
                ;;
            -*)
                shift
                ;;
            *)
                if [ -z "$target" ]; then
                    target="$1"
                    shift
                else
                    remote_cmd_present=1
                    break
                fi
                ;;
        esac
    done

    # Fall back to regular ssh if no target or remote command present
    [ -z "$target" ] && { command ssh "${orig_args[@]}"; return $?; }
    if [ $remote_cmd_present -eq 1 ]; then
        command ssh "${orig_args[@]}"
        return $?
    fi

    # Increment SSH depth for nested tracking
    local next_depth=$((${__AITERM_SSH_DEPTH:-0} + 1))
    
    # Encode script as base64
    local inline_b64
    inline_b64="$(printf '%s' "$inline_script" | base64 | tr -d '\n')"
    if [ -z "$inline_b64" ]; then
        command ssh "${orig_args[@]}"
        return $?
    fi

    # Fold long base64 strings
    if [ ${#inline_b64} -gt 4096 ]; then
        inline_b64="$(printf '%s' "$inline_b64" | fold -w 1000)"
    fi
    local inline_b64_env
    inline_b64_env="$(printf '%s' "$inline_b64" | tr -d '\n')"

    if [ -n "$AITERM_SSH_HIDE_PAYLOAD" ]; then
        local remote_cmd_str
        remote_cmd_str='remote_shell="${SHELL:-/bin/sh}"; [ -x "$remote_shell" ] || remote_shell=/bin/sh; payload="${AITERM_B64:-}"; [ -n "$payload" ] || exec "$remote_shell" -l; umask 077; tmpfile="$(mktemp -t aiterminal.XXXXXX 2>/dev/null || mktemp /tmp/aiterminal.XXXXXX)" || exit 1; chmod 600 "$tmpfile" 2>/dev/null || true; if command -v base64 >/dev/null 2>&1; then printf "%s" "$payload" | tr -d "\n" | base64 -d > "$tmpfile" || exit 1; elif command -v openssl >/dev/null 2>&1; then printf "%s" "$payload" | tr -d "\n" | openssl base64 -d > "$tmpfile" || exit 1; else exec "$remote_shell" -l; fi; if ! grep -q "AI Terminal OSC 133 Shell Integration" "$tmpfile"; then exec "$remote_shell" -l; fi; export __AITERM_TEMP_FILE="$tmpfile"; export __AITERM_INLINE_CACHE="$(cat "$tmpfile")"; export TERM_PROGRAM=aiterminal SHELL="$remote_shell"; case "$remote_shell" in */bash) exec "$remote_shell" --rcfile "$tmpfile" -i ;; */zsh) exec "$remote_shell" -l -c "source \"$tmpfile\"; exec \"$remote_shell\" -l" ;; *) exec "$remote_shell" -l ;; esac'
        command env AITERM_B64="$inline_b64_env" ssh -tt -o SendEnv=AITERM_B64 "${orig_args[@]}" "$remote_cmd_str"
        return $?
    fi

    local remote_cmd_str
    remote_cmd_str='remote_shell="${SHELL:-/bin/sh}"; [ -x "$remote_shell" ] || remote_shell=/bin/sh; umask 077; tmpfile="$(mktemp -t aiterminal.XXXXXX 2>/dev/null || mktemp /tmp/aiterminal.XXXXXX)" || exit 1; chmod 600 "$tmpfile" 2>/dev/null || true; if command -v base64 >/dev/null 2>&1; then printf "%s" "__AITERM_B64__" | tr -d "\n" | base64 -d > "$tmpfile" || exit 1; elif command -v openssl >/dev/null 2>&1; then printf "%s" "__AITERM_B64__" | tr -d "\n" | openssl base64 -d > "$tmpfile" || exit 1; else exec "$remote_shell" -l; fi; if ! grep -q "AI Terminal OSC 133 Shell Integration" "$tmpfile"; then exec "$remote_shell" -l; fi; export __AITERM_TEMP_FILE="$tmpfile"; export __AITERM_INLINE_CACHE="$(cat "$tmpfile")"; export __AITERM_SSH_DEPTH=__DEPTH__; export TERM_PROGRAM=aiterminal SHELL="$remote_shell"; export AITERM_REMOTE_BOOTSTRAP=1; case "$remote_shell" in */bash) exec "$remote_shell" --rcfile "$tmpfile" -i ;; */zsh) exec "$remote_shell" -c "[ -f ~/.zshrc ] && source ~/.zshrc; source \"$tmpfile\"; exec $remote_shell" ;; *) exec "$remote_shell" -l ;; esac'
    remote_cmd_str="${remote_cmd_str//__DEPTH__/$next_depth}"
    remote_cmd_str="${remote_cmd_str//__AITERM_B64__/$inline_b64}"
    
    command ssh -tt "${orig_args[@]}" "$remote_cmd_str"
    return $?
}

# Export function so it's available in scripts and subshells
export -f aiterm_ssh
