**Features:**
- One-click enable/disable MCP server
- Auto-generate configs for popular tools
- Real-time activity monitoring
- Permission management for external tools
- Approval workflow for dangerous commands

### 5. Improve the agent loop with patterns from open-source agents

Rather than integrating opencode wholesale (it's a Go binary, not embeddable), study and adopt specific patterns:

- **Extended thinking**: Use Claude's extended thinking API for complex multi-step tasks
- **Better error recovery**: When a tool fails, retry with adjusted parameters before giving up
- **Planning step**: For complex requests, have the AI outline a plan before executing
- **Step limit increase**: 15 steps may be too low for complex ops tasks; consider 25-30
- **Better tool result handling**: When output is truncated, offer to read specific sections
- **Memory across sessions**: Persist key facts between conversations (user preferences, common servers, project layouts)

## HPC as a Killer Use Case

### The HPC Opportunity

**Current HPC workflow is miserable:**
1. SSH to cluster
2. Write SLURM script locally
3. scp to cluster
4. Submit job
5. Wait and check queue manually
6. scp results back
7. Find bug
8. Repeat 20-50 times per day

**Your terminal + MCP solves this:**
- Claude Code (via MCP) can execute commands on the cluster through your SSH session
- AI can submit jobs, monitor queues, read logs - all on the actual cluster
- No more manual copying/syncing
- Works with ANY HPC center (see below)

### HPC-Specific MCP Tools

**Smart, Adaptive Tools (not center-specific):**
```typescript
markdown# AI Panel Strategy: Build, Integrate, or Pivot?

## The Question

The AI panel was built as a terminal-aware assistant for heavy terminal tasks, including remote execution over SSH. Tools like Claude Code and opencode are much better agents and battle-tested, but they're coding assistants for project workspaces, not general terminal assistants. Should we continue with the custom AI panel, integrate something like opencode's agents, or take another direction?

## Current State of the AI Panel

**What's been built (22 tools, Vercel AI SDK):**
- PTY-based execution with SSH/remote awareness
- 15-step agent loop with streaming
- Smart context management (embedding-based + keyword ranking)
- Conversation summarization (60-80% token savings)
- Auto-routing by query complexity
- Command approval/safety system
- User skill level detection (beginner/intermediate/expert)
- Platform and shell detection
- Tool categories: terminal commands, file ops (11), search (2), error analysis, git (2), system (5), utilities (2)

**What works well:**
- PTY execution through SSH, containers, HPC sessions (Claude Code/opencode can't do this)
- Terminal-specific tools (process finding, port checking, shell history, large file error scanning)
- Context management with token optimization
- Command safety/approval workflow

## Honest Comparison with Claude Code / opencode

**Where they genuinely outperform the AI panel:**
- Agent loop sophistication: error recovery, retries, knowing when to ask vs proceed
- File editing precision: diff-based edits with validation
- Multi-step planning and reasoning: extended thinking, plan-then-execute patterns
- Codebase understanding: project-wide search, architecture comprehension
- Battle-tested edge cases: thousands of users finding and fixing bugs
- Prompt engineering depth behind their system prompts

**Where the AI panel has an advantage:**
- PTY execution works through SSH, containers, srun, tmux (remote-aware)
- Terminal/ops-specific tooling (process, ports, system info, shell history)
- Integrated into the terminal UI with context capture
- Command approval workflow for safety

**Key insight:** Claude Code and opencode are *coding assistants*. The AI panel is a *terminal assistant*. These are different tools for different jobs. Trying to make the AI panel compete as a coding agent is a losing battle. For terminal/ops work, the panel has advantages they don't.

## Recommended Strategy: MCP-First Hybrid Approach

### 1. Build MCP Server as the Foundation

**Architecture: MCP Server + Dual Access**
```
┌─────────────────────────────────────────────────────┐
│           Your Terminal App                         │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │      MCP Server (Single Source of Truth)    │  │
│  │                                             │  │
│  │  • execute_in_terminal()                   │  │
│  │  • get_terminal_context()                  │  │
│  │  • get_ssh_session_info()                  │  │
│  │  • list_terminal_tabs()                    │  │
│  │  • submit_slurm_job()                      │  │
│  │  • check_slurm_queue()                     │  │
│  │  • ... all terminal/ops tools              │  │
│  │                                             │  │
│  │  [All tool logic lives HERE - 30+ tools]   │  │
│  └──────────────┬──────────────────────────────┘  │
│                 │                                   │
│        ┌────────┴────────┐                         │
│        ▼                 ▼                          │
│  ┌──────────┐      ┌──────────┐                   │
│  │ Built-in │      │ External │                    │
│  │ AI Panel │      │   Port   │                    │
│  │ (MCP     │      │ (stdio/  │                    │
│  │ client)  │      │  HTTP)   │                    │
│  └──────────┘      └─────┬────┘                   │
│                          │                          │
└──────────────────────────┼──────────────────────────┘
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
            ┌───────────┐     ┌──────────┐
            │Claude Code│     │ VS Code  │
            │           │     │ Continue │
            └───────────┘     └──────────┘
```

**Why MCP Server First:**
- **Single codebase**: All tool logic in one place
- **No duplication**: Your AI panel and external tools use the same implementation
- **Future-proof**: New tools automatically benefit both internal and external users
- **Ecosystem access**: Any MCP-compatible tool can leverage your terminal's unique capabilities
- **Easy maintenance**: Bug fixes and improvements happen once

**Key Benefits:**
1. Your built-in AI panel uses the MCP server internally (in-process, no overhead)
2. External tools (Claude Code, Cursor, VS Code) connect via stdio/HTTP
3. One tool definition works everywhere
4. Testing once validates all use cases

### 2. Stop competing with coding agents on code tasks

Don't try to make the AI panel a great code editor. Claude Code already excels at that and runs in a terminal. Users who want coding help will use Claude Code directly in the terminal app, but now Claude Code can execute commands **through your terminal's PTY** via MCP, getting access to SSH sessions, containers, and remote environments.

The AI panel's file editing tools (write_file, replace_in_file, etc.) will always be inferior to purpose-built coding agents. Accept this and focus on what you do best.

### 3. Double down on terminal/ops awareness

Focus the AI panel (and MCP server) on what makes it unique:

- **DevOps workflows**: Deploying, monitoring, log analysis, system administration
- **Remote session management**: SSH context persistence, multi-host awareness
- **Process/system monitoring**: Watch processes, ports, resource usage over time
- **Error triage**: The `analyze_error` + `find_errors_in_file` tools are already good; make them great
- **Shell workflow automation**: Chaining commands, building scripts from history patterns
- **Environment debugging**: PATH issues, missing dependencies, config problems on remote hosts
- **Log analysis**: Tail, filter, correlate logs across services
- **Container/cluster awareness**: Docker, Kubernetes, SLURM context
- **HPC workflows**: Job submission, queue monitoring, resource allocation (see HPC section below)

### 4. The MCP Panel: User-Facing Control

Build an MCP panel in your terminal UI for easy setup and monitoring:
```
┌─────────────────────────────────────────────────────────┐
│  MCP Server Panel                                       │
│  ┌───────────────────────────────────────────────────┐ │
│  │ Status: ● Running on localhost:3000               │ │
│  │                                                    │ │
│  │ Exposed Tools: 30                                 │ │
│  │ ✓ execute_in_terminal                            │ │
│  │ ✓ get_terminal_context                           │ │
│  │ ✓ get_ssh_session_info                           │ │
│  │ ✓ list_terminal_tabs                             │ │
│  │ ✓ submit_slurm_job (HPC)                         │ │
│  │ ... (view all)                                    │ │
│  │                                                    │ │
│  │ Connected Clients:                                │ │
│  │ • Claude Code (PID 12345)                        │ │
│  │ • VS Code Continue (PID 67890)                   │ │
│  │                                                    │ │
│  │ Recent Activity:                                  │ │
│  │ 14:23 - Claude Code: execute_in_terminal         │ │
│  │         "npm test" → Exit 0                      │ │
│  │ 14:25 - Claude Code: get_ssh_session_info        │ │
│  │         → prod-server (user@prod.example.com)    │ │
│  │                                                    │ │
│  │ Quick Setup:                                      │ │
│  │ [Copy Config for Claude Code]                     │ │
│  │ [Copy Config for VS Code]                         │ │
│  │                                                    │ │
│  │ Security:                                         │ │
│  │ [✓] Require approval for destructive commands    │ │
│  │ [✓] Block 'rm -rf /' patterns                    │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- One-click enable/disable MCP server
- Auto-generate configs for popular tools
- Real-time activity monitoring
- Permission management for external tools
- Approval workflow for dangerous commands

### 5. Improve the agent loop with patterns from open-source agents

Rather than integrating opencode wholesale (it's a Go binary, not embeddable), study and adopt specific patterns:

- **Extended thinking**: Use Claude's extended thinking API for complex multi-step tasks
- **Better error recovery**: When a tool fails, retry with adjusted parameters before giving up
- **Planning step**: For complex requests, have the AI outline a plan before executing
- **Step limit increase**: 15 steps may be too low for complex ops tasks; consider 25-30
- **Better tool result handling**: When output is truncated, offer to read specific sections
- **Memory across sessions**: Persist key facts between conversations (user preferences, common servers, project layouts)

## HPC as a Killer Use Case

### The HPC Opportunity

**Current HPC workflow is miserable:**
1. SSH to cluster
2. Write SLURM script locally
3. scp to cluster
4. Submit job
5. Wait and check queue manually
6. scp results back
7. Find bug
8. Repeat 20-50 times per day

**Your terminal + MCP solves this:**
- Claude Code (via MCP) can execute commands on the cluster through your SSH session
- AI can submit jobs, monitor queues, read logs - all on the actual cluster
- No more manual copying/syncing
- Works with ANY HPC center (see below)

### HPC-Specific MCP Tools

**Smart, Adaptive Tools (not center-specific):**
```typescript
// Generic execution - AI figures out cluster specifics
server.tool("execute_in_terminal", {
  description: "Execute command in current PTY (SSH/SLURM-aware)"
});

server.tool("get_terminal_context", {
  description: "Get current environment (detects SLURM, modules, etc)"
});

// Cluster discovery - learns each center automatically
server.tool("discover_cluster_config", {
  description: "Auto-detect SLURM version, module system, storage paths"
});

// Smart helpers - adapts to cluster conventions
server.tool("submit_job_smart", {
  description: "Submit SLURM job with auto-detected cluster conventions",
  parameters: {
    command: { type: "string" },
    requirements: {
      nodes: { type: "number" },
      gpus: { type: "number" },
      time_hours: { type: "number" }
    }
  }
  // AI learns: MIT uses --gres=gpu:volta:4
  //           NERSC uses -C gpu --gpus=4
  //           TACC uses launcher system
  // Generates appropriate script automatically
});

server.tool("monitor_jobs", {
  description: "Monitor SLURM jobs (handles squeue, sqs, custom commands)"
});
```

### Handling HPC Heterogeneity: Don't Hard-Code, Let AI Adapt

**The Problem:** Every HPC center is unique
- MIT: `--gres=gpu:volta:4`
- NERSC: `-C gpu --gpus=4` + QOS required
- TACC: Launcher system instead of job arrays
- AWS ParallelCluster: Different storage, auto-scaling

**The Solution: Adaptive Discovery**

Don't build center-specific tools. Build **generic tools** + **cluster profiling**:
```typescript
// First time on new cluster:
1. AI runs discovery commands:
   - sbatch --help
   - module avail
   - echo $SCRATCH
   - cat ~/.bashrc | grep -i slurm

2. AI builds cluster profile:
   {
     "hostname": "login.mit.edu",
     "slurm_version": "23.02",
     "gpu_syntax": "--gres=gpu:volta:COUNT",
     "module_system": "environment-modules",
     "storage": {
       "scratch": "/state/partition1/$USER",
       "home": "/home/$USER"
     }
   }

3. AI uses profile for future commands:
   - Generates MIT-style SLURM scripts
   - Uses correct GPU syntax
   - References correct storage paths

4. User switches to different cluster:
   - AI discovers new conventions
   - Adapts automatically
   - Just works
```

**Why This Works:**
- ✅ Works at ANY HPC center, even new ones
- ✅ No manual configuration needed
- ✅ AI learns from user's existing scripts
- ✅ Maintainable: 5 generic tools instead of 500 center-specific ones
- ✅ User can provide custom templates for edge cases

### HPC Market Opportunity

**Who needs this:**
- University researchers (1000s per major university)
- National labs (Livermore, Oak Ridge, Argonne)
- Industry research labs (OpenAI, Meta, Google internal)
- Cloud HPC users (AWS ParallelCluster, Azure CycleCloud)

**Market size:**
- ~1M researchers using HPC globally
- Willing to pay $20-50/month (often have grants)
- Clear value proposition: "Stop wasting 2 hours/day on job management"

**Competitive advantage:**
- Current tools: Open OnDemand (clunky), VS Code Remote (no SLURM awareness)
- Your terminal: AI-assisted HPC workflows, SLURM-aware, works with any cluster
- **Nobody else has this**

**The pitch:**
*"Let Claude Code manage your SLURM jobs. Works with any HPC cluster, no configuration needed."*

## What NOT to Do

- **Don't embed opencode as a library** - It's a standalone Go CLI, not designed to be embedded
- **Don't rewrite Claude Code's agent loop** - Years of engineering you can't replicate alone
- **Don't remove the AI panel** - It serves a different purpose than coding agents
- **Don't add more code editing tools** - They'll always be worse than purpose-built coding agents
- **Don't try to be everything** - Terminal/ops assistant is a clear niche with real value
- **Don't build center-specific HPC tools** - Build adaptive, generic tools instead
- **Don't maintain two codebases** - Use MCP as single source of truth

## Implementation Priority

| Priority | Task | Impact | Effort |
|----------|------|--------|--------|
| 1 | Refactor existing tools to MCP server | Highest - foundation for everything | Medium (2-3 days) |
| 2 | Connect AI panel as MCP client | High - maintain existing functionality | Low (1 day) |
| 3 | Add external MCP server support | High - enables ecosystem access | Low (1 day) |
| 4 | Build MCP panel UI | Medium - user-facing control | Medium (2-3 days) |
| 5 | Add basic HPC tools (discovery, smart submit) | High - killer differentiation | Medium (1 week) |
| 6 | Sharpen terminal/ops focus | High - clear differentiation | Low-Medium |
| 7 | Improve agent loop (extended thinking, error recovery) | High - better task completion | Medium |
| 8 | Add advanced HPC tools (interactive jobs, modules) | Medium - HPC power users | Medium (1 week) |
| 9 | Cross-session memory | Medium - better UX over time | Medium |
| 10 | Add terminal-specific intelligence | Medium - unique value | Medium |

## MCP Implementation Details

### Phase 1: Build MCP Server Foundation (Week 1)
```typescript
// mcp-server/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

const server = new Server({
  name: "aiterminal",
  version: "1.0.0",
});

// Convert your existing 22 tools to MCP format
server.tool("execute_in_terminal", {
  description: "Execute command in active PTY session",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      tab_id: { type: "string", optional: true }
    }
  }
}, async (args) => {
  const pty = args.tab_id 
    ? getPtyForTab(args.tab_id)
    : getActivePty();
  return await pty.execute(args.command);
});

// Add context awareness
server.tool("list_terminal_tabs", {
  description: "List all terminal tabs and their contexts"
}, async () => {
  return {
    tabs: [
      { 
        id: "tab1", 
        title: "local",
        cwd: "/home/user/projects",
        active: true
      },
      {
        id: "tab2",
        title: "prod-server",
        cwd: "/var/www/app",
        ssh: "user@prod.example.com",
        active: false
      }
    ]
  };
});

// HPC-specific
server.tool("discover_cluster_config", ...);
server.tool("submit_job_smart", ...);
```

### Phase 2: Connect AI Panel as Client (Week 1)
```typescript
// ai-panel/agent.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InProcessTransport } from "@modelcontextprotocol/sdk/inprocess.js";

class AIPanelAgent {
  private mcpClient: Client;
  
  async initialize() {
    this.mcpClient = new Client({
      name: "aiterminal-panel",
      version: "1.0.0"
    });
    
    // Use in-process transport (no network overhead)
    const transport = new InProcessTransport(server);
    await this.mcpClient.connect(transport);
  }
  
  async chat(message: string) {
    // Get tools from MCP server
    const { tools } = await this.mcpClient.listTools();
    
    // Use them in your AI agent
    const response = await ai.chat({
      model: "claude-sonnet-4",
      tools: tools,
      messages: [{ role: "user", content: message }]
    });
    
    // Handle tool calls through MCP
    // ... existing agent loop logic
  }
}
```

### Phase 3: External Access (Week 1)
```typescript
// Start MCP server for external tools
if (settings.mcpServerEnabled) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

## Potential New Terminal/Ops Tools

Ideas for tools that would differentiate from coding agents:

**System Monitoring:**
- `watch_process` - Monitor a process and alert on changes
- `resource_monitor` - CPU/memory/disk snapshot with historical comparison
- `service_status` - Check systemd/launchd services
- `network_diagnose` - Check connectivity, DNS, ports in sequence

**Environment Management:**
- `compare_environments` - Diff env vars between local and remote
- `ssh_context` - Detect and expose current SSH session details to the AI
- `container_inspect` - Docker/podman container details

**Log Analysis:**
- `analyze_logs` - Smart log parsing with pattern detection across multiple files
- `tail_follow` - Follow logs with intelligent filtering

**Workflow Automation:**
- `script_from_history` - Generate reusable scripts from recent command patterns
- `command_explain` - Deep explanation of complex command pipelines

**HPC-Specific:**
- `start_interactive_job` - Launch SLURM interactive session with srun
- `execute_in_slurm_job` - Run commands in active SLURM job
- `check_gpu_availability` - Query available GPUs across cluster
- `load_modules` - Manage environment modules
- `check_scratch_usage` - Monitor storage quota and usage
- `stage_data` - Move data between archive/scratch/home

## Positioning and Marketing

### Old Positioning (Weak):
*"We're a terminal with a built-in AI assistant"*
- Competing directly with Claude Code
- "Our AI is also good" (but it's not)
- Limited market

### New Positioning (Strong):
*"The terminal that makes ALL AI coding assistants work with remote environments and HPC clusters"*

**Value Propositions:**

**For Developers:**
- "Use Claude Code? Make it work with your SSH sessions"
- "Stop copying commands between terminal and AI"
- "Your AI assistant, now with remote execution"

**For HPC Users:**
- "AI-assisted HPC: Let Claude Code manage your SLURM jobs"
- "Works with any HPC cluster, no configuration"
- "Stop wasting 2 hours/day on job management"

**For DevOps:**
- "Terminal awareness for your AI tools"
- "Execute on prod without leaving your AI assistant"
- "Multi-environment workflows made simple"

### The Network Effect
```
Your Terminal (MCP Server)
├─> Your AI Agent (terminal/ops tasks)
├─> Claude Code (code editing + your PTY)
├─> Cursor (code editing + your PTY)
├─> VS Code Continue (code editing + your PTY)
├─> Windsurf (code editing + your PTY)
└─> Any future MCP client (+ your PTY)
```

You're not competing with coding assistants. You're becoming **infrastructure they depend on**.

## Success Metrics

**Technical:**
- MCP server uptime and latency
- Tool call success rate
- Cluster discovery accuracy (HPC)

**User Engagement:**
- % of users who enable MCP server
- External tool connections per user
- Commands executed via MCP vs built-in panel
- HPC job submissions via AI

**Product-Market Fit:**
- Time saved per user (survey)
- Willingness to pay ($20-50/month for HPC users)
- Feature requests: terminal/ops vs coding
- Churn by user type (dev vs HPC vs DevOps)

## Summary

The AI panel should evolve from "general AI assistant that happens to be in a terminal" to **"the terminal that makes all AI assistants work better with remote environments and HPC workflows."**

**Key strategic decisions:**
1. ✅ Build MCP server as single source of truth
2. ✅ Your AI panel uses MCP internally (no duplication)
3. ✅ External tools connect via MCP (ecosystem access)
4. ✅ Focus on terminal/ops/HPC (not coding)
5. ✅ HPC as killer differentiation (adaptive, not center-specific)
6. ✅ Let Claude Code be great at code, you be great at execution context

This plays to your strengths (PTY execution, remote awareness, HPC) and avoids competing where you can't win (code editing, codebase understanding). You become **infrastructure** instead of just an app.