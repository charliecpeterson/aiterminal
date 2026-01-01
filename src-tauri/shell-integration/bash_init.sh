#!/bin/bash
# AI Terminal OSC 133 Shell Integration

# Remove temp helper if used (non-persistent remote bootstrap)
if [ -n "$__AITERM_TEMP_FILE" ] && [ -f "$__AITERM_TEMP_FILE" ]; then
    rm -f "$__AITERM_TEMP_FILE"
    unset __AITERM_TEMP_FILE
fi

# Guard to prevent multiple sourcing (do not export so child shells can still init)
if [ -n "$__AITERM_INTEGRATION_LOADED" ]; then
    return
fi
__AITERM_INTEGRATION_LOADED=1

__aiterm_source_user_file() {
    # Source a user rc file safely.
    # Some dotfiles contain top-level `return` statements (e.g. guard clauses).
    # If we source them directly, that `return` can abort this integration script
    # before we install OSC 133 hooks. Wrapping in a function makes `return`
    # return from this function instead.
    local f="$1"
    [ -n "$f" ] || return 0
    [ -f "$f" ] || return 0
    # shellcheck disable=SC1090
    . "$f" 2>/dev/null || true
    return 0
}

# Advertise to downstream shells
export TERM_PROGRAM=aiterminal

# Ensure user rc is loaded once (for colors/aliases) before installing hooks
if [ -z "$__AITERM_USER_RC_DONE" ]; then
    __AITERM_USER_RC_DONE=1
    if [ -n "$BASH_VERSION" ]; then __aiterm_source_user_file ~/.bashrc; fi
    if [ -n "$BASH_VERSION" ] && [ -f ~/.bash_profile ] && [ -z "$__AITERM_BASH_PROFILE_DONE" ]; then
        __AITERM_BASH_PROFILE_DONE=1
        __aiterm_source_user_file ~/.bash_profile
    fi
    if [ -n "$ZSH_VERSION" ]; then __aiterm_source_user_file ~/.zshrc; fi
fi

# Restore login profile on remote bootstrap (so MOTD appears)
if [ -n "$AITERM_REMOTE_BOOTSTRAP" ] && [ -z "$__AITERM_LOGIN_SOURCED" ]; then
    __AITERM_LOGIN_SOURCED=1
    if [ -f /etc/profile ]; then source /etc/profile 2>/dev/null; fi
    if [ -r /etc/motd ]; then cat /etc/motd; fi
    if [ -r /run/motd ]; then cat /run/motd; fi
    if [ -r /run/motd.dynamic ]; then cat /run/motd.dynamic; fi
fi

__aiterm_emit() { printf "\033]133;%s\007" "$1"; }
__aiterm_emit_host() {
    if [ -z "$__AITERM_HOSTNAME" ]; then
        __AITERM_HOSTNAME="$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo unknown)"
    fi
    printf "\033]633;H;%s\007" "$__AITERM_HOSTNAME"
}

# Emit RemoteHost OSC sequence for SSH detection
__aiterm_emit_remote_host() {
    if [ -n "$SSH_CONNECTION" ] || [ -n "$SSH_CLIENT" ] || [ -n "$SSH_TTY" ]; then
        # We're in an SSH session - report user@host:ip:depth
        local current_user="${USER:-$(whoami 2>/dev/null || echo unknown)}"
        local current_host="$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo unknown)"
        local depth="${__AITERM_SSH_DEPTH:-0}"
        
        # Extract remote IP from SSH_CONNECTION (format: client_ip client_port server_ip server_port)
        # We want the server_ip (third field) which is the IP we're connected to
        local remote_ip=""
        if [ -n "$SSH_CONNECTION" ]; then
            remote_ip=$(echo "$SSH_CONNECTION" | awk '{print $3}')
        fi
        
        # Send user@host:ip:depth so we can track nesting
        if [ -n "$remote_ip" ]; then
            printf "\033]1337;RemoteHost=%s@%s:%s;Depth=%d\007" "$current_user" "$current_host" "$remote_ip" "$depth"
        else
            printf "\033]1337;RemoteHost=%s@%s;Depth=%d\007" "$current_user" "$current_host" "$depth"
        fi
    else
        # Local session - send empty/local marker
        printf "\033]1337;RemoteHost=;Depth=0\007"
    fi
}

__aiterm_mark_prompt() { 
    __aiterm_emit "A"
    __aiterm_emit_remote_host  # Update SSH state on every prompt
}
__aiterm_mark_output_start() { __aiterm_emit "C"; }
__aiterm_mark_done() { local ret=${1:-$?}; __aiterm_emit "D;${ret}"; }

# Cache the integration script for nested SSH sessions
if [ -z "$__AITERM_INLINE_CACHE" ]; then
    __AITERM_INLINE_CACHE="$(cat "$HOME/.config/aiterminal/bash_init.sh" 2>/dev/null || echo '')"
    export __AITERM_INLINE_CACHE
fi

# Track SSH nesting depth
if [ -z "$__AITERM_SSH_DEPTH" ]; then
    __AITERM_SSH_DEPTH=0
fi
export __AITERM_SSH_DEPTH

# Define aiterm_ssh function (inline so it travels with integration)
aiterm_ssh() {
    if [ "$TERM_PROGRAM" != "aiterminal" ]; then 
        command ssh "$@"
        return $?
    fi

    local orig_args=("$@")
    [ ${#orig_args[@]} -eq 0 ] && { printf '%s\n' "usage: ssh destination"; return 2; }
    
    # Use cached integration script
    local inline_script="$__AITERM_INLINE_CACHE"
    if [ -z "$inline_script" ]; then
        command ssh "${orig_args[@]}"
        return $?
    fi

    # Parse args to detect if remote command is present
    local target=""
    local remote_cmd_present=0
    set -- "$@"
    while [ $# -gt 0 ]; do
        case "$1" in
            -o|-J|-F|-i|-b|-c|-D|-E|-e|-I|-L|-l|-m|-O|-p|-P|-Q|-R|-S|-W|-w|-B)
                shift; [ $# -gt 0 ] && shift ;;
            -o*|-J*|-F*|-i*|-b*|-c*|-D*|-E*|-e*|-I*|-L*|-l*|-m*|-O*|-p*|-P*|-Q*|-R*|-S*|-W*|-w*|-B*)
                shift ;;
            --) shift; [ $# -gt 0 ] && target="$1" && shift; [ $# -gt 0 ] && remote_cmd_present=1; break ;;
            -*) shift ;;
            *) [ -z "$target" ] && target="$1" && shift || { remote_cmd_present=1; break; } ;;
        esac
    done

    # Fall back if no target or remote command present
    [ -z "$target" ] && { command ssh "${orig_args[@]}"; return $?; }
    [ $remote_cmd_present -eq 1 ] && { command ssh "${orig_args[@]}"; return $?; }

    # Increment SSH depth
    local next_depth=$((${__AITERM_SSH_DEPTH:-0} + 1))
    
    # Encode and inject
    local inline_b64="$(printf '%s' "$inline_script" | base64 | tr -d '\n')"
    [ -z "$inline_b64" ] && { command ssh "${orig_args[@]}"; return $?; }

    # Remote bootstrap command template (single-quoted to avoid local interpolation).
    # We flatten it to one line before sending to ssh.
    local remote_cmd
    remote_cmd="$(cat <<'AITERM_REMOTE_CMD'
remote_shell="${SHELL:-/bin/sh}"; [ -x "$remote_shell" ] || remote_shell=/bin/sh; umask 077; tmpfile="$(mktemp -t aiterminal.XXXXXX 2>/dev/null || mktemp /tmp/aiterminal.XXXXXX)" || exit 1; chmod 600 "$tmpfile" 2>/dev/null || true; if command -v base64 >/dev/null 2>&1; then printf "%s" "__B64__" | tr -d "\n" | base64 -d > "$tmpfile" || exit 1; elif command -v openssl >/dev/null 2>&1; then printf "%s" "__B64__" | tr -d "\n" | openssl base64 -d > "$tmpfile" || exit 1; else exec "$remote_shell" -l; fi; export __AITERM_TEMP_FILE="$tmpfile" __AITERM_INLINE_CACHE="$(cat "$tmpfile")" __AITERM_SSH_DEPTH=__D__ TERM_PROGRAM=aiterminal SHELL="$remote_shell" AITERM_REMOTE_BOOTSTRAP=1; case "$remote_shell" in */bash) exec "$remote_shell" --rcfile "$tmpfile" -i ;; */zsh) exec "$remote_shell" -c "source \"$tmpfile\"; exec $remote_shell" ;; *) exec "$remote_shell" -l ;; esac
AITERM_REMOTE_CMD
)"
    remote_cmd="${remote_cmd//$'\n'/ }"
    remote_cmd="${remote_cmd//__B64__/$inline_b64}"
    remote_cmd="${remote_cmd//__D__/$next_depth}"
    
    command ssh -tt "${orig_args[@]}" "$remote_cmd"
    return $?
}

# Wrap ssh command to automatically use aiterm_ssh
if [ "$TERM_PROGRAM" = "aiterminal" ]; then
    ssh() {
        aiterm_ssh "$@"
    }
    export -f ssh 2>/dev/null || true
    export -f aiterm_ssh 2>/dev/null || true
fi

# Define aiterm_python function to inject OSC 133 markers into Python REPL
aiterm_python() {
    local python_cmd="$1"
    shift
    
    if [ "$TERM_PROGRAM" != "aiterminal" ]; then 
        command "$python_cmd" "$@"
        return $?
    fi
    
    # Always recreate Python startup file with correct escape sequences
    local python_startup="${HOME}/.config/aiterminal/python_startup.py"
    mkdir -p "${HOME}/.config/aiterminal" 2>/dev/null
    
    # Use a single-quoted heredoc to avoid shell interpolation and reduce quoting bugs.
    # Backslash escapes (e.g. \033) remain literal in the file and are interpreted by Python.
    cat >"$python_startup" <<'PY'
# AI Terminal Python REPL Integration
import sys, os, builtins, atexit

if os.environ.get('TERM_PROGRAM') == 'aiterminal':
    def emit_marker(marker):
        sys.stdout.write(f'\033]133;{marker}\007')
        sys.stdout.flush()

    sys.stdout.write('\033]1337;PythonREPL=1\007')
    sys.stdout.flush()

    # Track whether the current prompt has started a command block.
    # Some statements (e.g. import) produce no displayhook call; we close them on the next prompt.
    _aiterm_needs_done = False
    _aiterm_cmd_id = 0
    _aiterm_active_id = None

    _original_exit = builtins.exit
    class _AITermExit:
        def __repr__(self): return 'Use exit() or Ctrl-D (i.e. EOF) to exit'
        def __call__(self, code=None):
            try:
                sys.stdout.write('\033]1337;PythonREPL=0\007')
                sys.stdout.flush(); os.fsync(sys.stdout.fileno())
            except: pass
            _original_exit(code)
    builtins.exit = builtins.quit = _AITermExit()

    def _aiterm_atexit():
        try:
            sys.stdout.write('\033]1337;PythonREPL=0\007')
            sys.stdout.flush(); os.fsync(sys.stdout.fileno())
        except: pass
    atexit.register(_aiterm_atexit)

    _original_displayhook = sys.displayhook
    def _aiterm_displayhook(value):
        global _aiterm_active_id, _aiterm_needs_done
        if value is not None: _original_displayhook(value)
        try: sys.stdout.flush()
        except: pass
        emit_marker(f'D;0;py={_aiterm_active_id or 0}')
        _aiterm_active_id = None
        _aiterm_needs_done = False
    sys.displayhook = _aiterm_displayhook

    class _AITermPrompt:
        def __init__(self, prompt_text): self.prompt_text = prompt_text
        def __str__(self):
            global _aiterm_needs_done, _aiterm_cmd_id, _aiterm_active_id
            if _aiterm_needs_done:
                emit_marker(f'D;0;py={_aiterm_active_id or 0}')
                _aiterm_active_id = None
                _aiterm_needs_done = False
            _aiterm_cmd_id += 1
            _aiterm_active_id = _aiterm_cmd_id
            emit_marker(f'A;py={_aiterm_active_id}')
            emit_marker(f'C;py={_aiterm_active_id}')
            _aiterm_needs_done = True
            return self.prompt_text
        def __repr__(self): return str(self)
    sys.ps1 = _AITermPrompt('>>> ')
    sys.ps2 = _AITermPrompt('... ')

    _original_excepthook = sys.excepthook
    def _aiterm_excepthook(exc_type, exc_value, exc_traceback):
        global _aiterm_active_id, _aiterm_needs_done
        _original_excepthook(exc_type, exc_value, exc_traceback)
        try: sys.stderr.flush()
        except: pass
        emit_marker(f'D;1;py={_aiterm_active_id or 0}')
        _aiterm_active_id = None
        _aiterm_needs_done = False
    sys.excepthook = _aiterm_excepthook
PY
    
    # Run Python with our startup file
    PYTHONSTARTUP="$python_startup" command "$python_cmd" "$@"
    return $?
}

# Wrap python/python3 commands to automatically use aiterm_python
if [ "$TERM_PROGRAM" = "aiterminal" ]; then
    python() {
        aiterm_python "python" "$@"
    }
    python3() {
        aiterm_python "python3" "$@"
    }
    export -f python 2>/dev/null || true
    export -f python3 2>/dev/null || true
    export -f aiterm_python 2>/dev/null || true
fi

# Define aiterm_r function to inject OSC 133 markers into R REPL
aiterm_r() {
    local r_cmd="$1"
    shift

    if [ "$TERM_PROGRAM" != "aiterminal" ]; then
        command "$r_cmd" "$@"
        return $?
    fi

    # Only wrap interactive sessions (avoid impacting Rscript / non-tty)
    if [ ! -t 0 ] || [ ! -t 1 ]; then
        command "$r_cmd" "$@"
        return $?
    fi

    local r_profile="${HOME}/.config/aiterminal/Rprofile.R"
    mkdir -p "${HOME}/.config/aiterminal" 2>/dev/null

    # Optional debug log (does not print into the terminal).
    if [ "${AITERM_R_DEBUG:-}" = "1" ]; then
        {
            printf '[%s] aiterm_r invoked (shell=%s, cmd=%s)\n' "$(date '+%F %T' 2>/dev/null || date)" "${SHELL:-unknown}" "$r_cmd"
        } >>"${HOME}/.config/aiterminal/r_debug.log" 2>/dev/null || true
    fi

    # Signal R REPL mode before launching R (helps confirm wrapper execution).
    printf "\033]1337;RREPL=1\007"

        # Use a single-quoted heredoc to avoid shell interpolation and reduce quoting bugs.
        # Backslash escapes (e.g. \033, \001) remain literal in the file and are interpreted by R.
        cat >"$r_profile" <<'RPROFILE'
# AI Terminal R REPL Integration
if (Sys.getenv("TERM_PROGRAM") == "aiterminal") {
    .aiterm_debug <- function(msg) {
        if (Sys.getenv("AITERM_R_DEBUG") != "1") return(invisible(NULL))
        f <- file.path(Sys.getenv("HOME"), ".config", "aiterminal", "r_debug.log")
        try(cat(sprintf("[%s] %s\n", format(Sys.time(), "%F %T"), msg), file = f, append = TRUE), silent = TRUE)
        invisible(NULL)
    }
    .aiterm_flush <- function() {
        # flush.console() is in utils; it may not be attached in some sessions
        if (requireNamespace("utils", quietly = TRUE)) {
            try(utils::flush.console(), silent = TRUE)
        }
    }
    # Use BEL terminator. For prompt-time markers, embed OSC inside the prompt string
    # wrapped with \001/\002 so readline treats it as zero-width (no visible artifacts).
    .aiterm_emit1337 <- function(s) { cat(sprintf("\033]1337;%s\007", s)); .aiterm_flush() }
    .aiterm_osc133 <- function(s) sprintf("\033]133;%s\007", s)
    # Signal start of R REPL
    .aiterm_emit1337("RREPL=1")

    # Track last command status; update the prompt so the NEXT prompt render emits markers.
    .aiterm_has_prev <- FALSE
    .aiterm_last_code <- 0
    .aiterm_base_prompt <- getOption("prompt")
    .aiterm_base_continue <- getOption("continue")

    .aiterm_set_prompt <- function() {
        seq <- if (.aiterm_has_prev) paste0(.aiterm_osc133(paste0("D;", .aiterm_last_code)), .aiterm_osc133("A")) else .aiterm_osc133("A")
        wrapped <- paste0("\001", seq, "\002")
        options(prompt = paste0(wrapped, .aiterm_base_prompt))
        options(continue = .aiterm_base_continue)
        .aiterm_debug(sprintf("set_prompt(has_prev=%s,last=%s)", .aiterm_has_prev, .aiterm_last_code))
        invisible(NULL)
    }

    # Some R builds report ok=TRUE even when an error was printed. Track uncaught errors
    # via options(error=...) so we can reliably set D;1 for the next prompt.
    .aiterm_error_seen <- FALSE
    .aiterm_orig_error <- getOption("error")
    options(error = function() {
        .aiterm_last_code <<- 1
        .aiterm_has_prev <<- TRUE
        .aiterm_error_seen <<- TRUE
        try(.aiterm_set_prompt(), silent = TRUE)
        orig <- .aiterm_orig_error
        if (is.function(orig)) try(orig(), silent = TRUE)
        else if (is.language(orig)) try(eval(orig, envir = .GlobalEnv), silent = TRUE)
        invisible(NULL)
    })

    invisible(addTaskCallback(function(expr, value, ok, visible) {
        if (isTRUE(.aiterm_error_seen)) {
            # Some errors do not trigger this callback. If we still see the flag here and
            # ok is TRUE, we are likely running the *next* successful command; avoid "bleeding"
            # the previous error status into it.
            .aiterm_last_code <<- if (isTRUE(ok)) 0 else 1
            .aiterm_error_seen <<- FALSE
        } else {
            # If we did not see an uncaught error, treat as success. (Some frontends pass
            # non-TRUE values for ok even on success.)
            .aiterm_last_code <<- 0
        }
        .aiterm_has_prev <<- TRUE
        .aiterm_debug(sprintf("taskcb(ok=%s, err_seen=%s) -> last=%s", ok, .aiterm_error_seen, .aiterm_last_code))
        try(.aiterm_set_prompt(), silent = TRUE)
        TRUE
    }, name = "aiterminal_taskcb"))

    # Ensure the first prompt opens a marker.
    try(.aiterm_set_prompt(), silent = TRUE)
}
RPROFILE

    R_PROFILE_USER="$r_profile" command "$r_cmd" "$@"
    local ret=$?
    # Best-effort signal end of R REPL (after returning to shell)
    printf "\033]1337;RREPL=0\007"
    return $ret
}

# Wrap R command to automatically use aiterm_r
if [ "$TERM_PROGRAM" = "aiterminal" ]; then
    R() {
        aiterm_r "R" "$@"
    }
    export -f R 2>/dev/null || true
    export -f aiterm_r 2>/dev/null || true
fi

if [ -n "$BASH_VERSION" ]; then
    __aiterm_prompt_wrapper() {
        local ret=$?
        __AITERM_IN_PROMPT=1
        __aiterm_mark_done "$ret"
        __aiterm_mark_prompt
        __aiterm_emit_host
        __AITERM_COMMAND_STARTED=
        __AITERM_IN_PROMPT=
    }

    if declare -p PROMPT_COMMAND 2>/dev/null | grep -q 'declare -a'; then
        if [ -n "$AITERM_HOOK_DEBUG" ]; then
            echo "AITERM hook: bash PROMPT_COMMAND is array" 1>&2
        fi
        __AITERM_PC_MANAGED=1
        __aiterm_has_wrapper=0
        for __aiterm_pc in "${PROMPT_COMMAND[@]}"; do
            if [ "$__aiterm_pc" = "__aiterm_prompt_wrapper" ]; then
                __aiterm_has_wrapper=1
                break
            fi
        done
        if [ $__aiterm_has_wrapper -eq 0 ]; then
            PROMPT_COMMAND=(__aiterm_prompt_wrapper "${PROMPT_COMMAND[@]}")
        fi
        unset __aiterm_pc __aiterm_has_wrapper
    else
        if [ -n "$AITERM_HOOK_DEBUG" ]; then
            echo "AITERM hook: bash PROMPT_COMMAND is string" 1>&2
        fi
        __AITERM_PC_MANAGED=1
        if [ -n "$PROMPT_COMMAND" ]; then
            PROMPT_COMMAND=(__aiterm_prompt_wrapper "$PROMPT_COMMAND")
        else
            PROMPT_COMMAND="__aiterm_prompt_wrapper"
        fi
    fi

    __aiterm_preexec() {
        if [ -n "$COMP_LINE" ]; then return; fi  # skip completion
        if [ -n "$__AITERM_IN_PROMPT" ]; then return; fi
        if [ -n "$__AITERM_COMMAND_STARTED" ]; then return; fi
        case "$BASH_COMMAND" in
            __aiterm_prompt_wrapper*|__aiterm_preexec*) return ;;
        esac
        __AITERM_COMMAND_STARTED=1
        __aiterm_mark_output_start
    }
    trap '__aiterm_preexec' DEBUG
elif [ -n "$ZSH_VERSION" ]; then
    if [ -z "$__AITERM_ZSH_HOOKS" ]; then
        if [ -n "$AITERM_HOOK_DEBUG" ]; then
            echo "AITERM hook: zsh add hooks" 1>&2
        fi
        __AITERM_ZSH_HOOKS=1
        autoload -Uz add-zsh-hook
        __aiterm_precmd() { __aiterm_mark_done $?; __aiterm_mark_prompt; __aiterm_emit_host; __AITERM_COMMAND_STARTED=; }
        __aiterm_preexec() {
            if [ -n "$__AITERM_COMMAND_STARTED" ]; then return; fi
            __AITERM_COMMAND_STARTED=1
            __aiterm_mark_output_start
        }
        add-zsh-hook precmd __aiterm_precmd
        add-zsh-hook preexec __aiterm_preexec
    fi
fi

if [ -z "$__AITERM_OSC133_BANNER_SHOWN" ]; then
    export __AITERM_OSC133_BANNER_SHOWN=1
    if [ -n "$AITERM_HOOK_DEBUG" ] || [ -n "$AITERM_SSH_DEBUG" ]; then
        echo "AI Terminal OSC 133 shell integration active ($(basename "$SHELL"))"
    fi
fi

# aiterm_render - Preview files in a popup window
aiterm_render() {
    if [ "$TERM_PROGRAM" != "aiterminal" ]; then
        echo "aiterm_render: This command only works in AI Terminal"
        return 1
    fi
    
    if [ $# -eq 0 ]; then
        echo "Usage: aiterm_render <file>"
        echo "Supported formats: .md, .html, .txt"
        return 1
    fi
    
    local file="$1"
    
    if [ ! -f "$file" ]; then
        echo "aiterm_render: File not found: $file"
        return 1
    fi
    
    # Get absolute path
    local abs_path
    if [[ "$file" = /* ]]; then
        abs_path="$file"
    else
        abs_path="$(pwd)/$file"
    fi
    
    # Read file content and base64 encode it
    local content
    if command -v base64 >/dev/null 2>&1; then
        content="$(cat "$file" | base64 | tr -d '\n')"
    elif command -v openssl >/dev/null 2>&1; then
        content="$(cat "$file" | openssl base64 | tr -d '\n')"
    else
        echo "aiterm_render: base64 command not found" >&2
        return 1
    fi
    
    # Get just the filename for display
    local filename="${file##*/}"
    
    # Emit OSC sequence with filename and base64 content
    printf "\033]1337;PreviewFile=name=%s;content=%s\007" "$filename" "$content"
    
    return 0
}

export -f aiterm_render 2>/dev/null || true
