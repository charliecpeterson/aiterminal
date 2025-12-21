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

# Advertise to downstream shells
export TERM_PROGRAM=aiterminal

# Ensure user rc is loaded once (for colors/aliases) before installing hooks
if [ -z "$__AITERM_USER_RC_DONE" ]; then
    __AITERM_USER_RC_DONE=1
    if [ -n "$BASH_VERSION" ] && [ -f ~/.bashrc ]; then source ~/.bashrc 2>/dev/null; fi
    if [ -n "$BASH_VERSION" ] && [ -f ~/.bash_profile ] && [ -z "$__AITERM_BASH_PROFILE_DONE" ]; then
        __AITERM_BASH_PROFILE_DONE=1
        source ~/.bash_profile 2>/dev/null
    fi
    if [ -n "$ZSH_VERSION" ] && [ -f ~/.zshrc ]; then source ~/.zshrc 2>/dev/null; fi
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
        # We're in an SSH session - report user@host:ip
        local current_user="${USER:-$(whoami 2>/dev/null || echo unknown)}"
        local current_host="$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo unknown)"
        
        # Extract remote IP from SSH_CONNECTION (format: client_ip client_port server_ip server_port)
        # We want the server_ip (third field) which is the IP we're connected to
        local remote_ip=""
        if [ -n "$SSH_CONNECTION" ]; then
            remote_ip=$(echo "$SSH_CONNECTION" | awk '{print $3}')
        fi
        
        # Send user@host:ip so we can use the IP for latency measurement
        if [ -n "$remote_ip" ]; then
            printf "\033]1337;RemoteHost=%s@%s:%s\007" "$current_user" "$current_host" "$remote_ip"
        else
            printf "\033]1337;RemoteHost=%s@%s\007" "$current_user" "$current_host"
        fi
    else
        # Local session - send empty/local marker
        printf "\033]1337;RemoteHost=\007"
    fi
}

__aiterm_mark_prompt() { 
    __aiterm_emit "A"
    __aiterm_emit_remote_host  # Update SSH state on every prompt
}
__aiterm_mark_output_start() { __aiterm_emit "C"; }
__aiterm_mark_done() { local ret=${1:-$?}; __aiterm_emit "D;${ret}"; }

# Source aiterm_ssh helper if it exists (must be done before creating ssh wrapper)
if [ -f "$HOME/.config/aiterminal/ssh_helper.sh" ]; then
    source "$HOME/.config/aiterminal/ssh_helper.sh"
fi

# Wrap ssh command to automatically use aiterm_ssh in AI Terminal
# Export function so it works in scripts and subshells
if [ "$TERM_PROGRAM" = "aiterminal" ] && command -v aiterm_ssh >/dev/null 2>&1; then
    ssh() {
        aiterm_ssh "$@"
    }
    export -f ssh
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
