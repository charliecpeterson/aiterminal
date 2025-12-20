# AI Quick Actions Feature

## Overview
AI Quick Actions enhance the terminal marker menu with context-aware AI assistance. Each action has a tailored system prompt optimized for its specific purpose.

## Visual Design

### Marker Menu Layout
```
┌─────────────────────────────────┐
│ Copy Command                    │
│ Copy Command + Output           │
│ Copy Output                     │
├─────────────────────────────────┤
│ Add Command to Context          │
│ Add Command + Output            │
│ Add Output to Context           │
├─────────────────────────────────┤
│ AI QUICK ACTIONS                │
│ 🔍 Explain This                 │   ← Always shows
│ ⚠️  Explain Error               │   ← Only on errors (exitCode !== 0)
│ 🔧 Suggest Fix                  │   ← Only on errors
│ ➡️  What's Next?                │   ← Only on success (exitCode === 0)
└─────────────────────────────────┘
```

## Quick Actions

### 1. 🔍 Explain This
**Shows:** Always (any command)  
**Purpose:** Educational - understand what happened

**System Prompt:**
```
You are a helpful terminal assistant. When given a command and its output:
- Explain what the command does in clear, concise language
- Describe what the output shows or means
- Point out any notable patterns, warnings, or important details
- Keep the explanation practical and focused on what the user needs to know
- Use examples when helpful
Keep your response brief and actionable.
```

**User Prompt Template:**
```
Explain this command and its output:

Command:
ls -la /var/log

Output:
drwxr-xr-x 42 root root 4096 Dec 20 10:30 .
drwxr-xr-x 14 root root 4096 Dec 15 09:12 ..
-rw-r--r--  1 root root  123 Dec 20 10:30 auth.log
```

**Expected AI Response:**
> This command lists all files in `/var/log` with detailed information:
> - `ls` lists directory contents
> - `-la` shows all files (including hidden) with permissions, owner, size, and timestamps
> 
> The output shows:
> - `.` and `..` entries (current and parent directory)
> - `auth.log` is readable by all, writable only by root, 123 bytes, modified at 10:30 today
> - All files are owned by root with standard log directory permissions

---

### 2. ⚠️ Explain Error
**Shows:** Only when `exitCode !== 0`  
**Purpose:** Debug - understand what went wrong

**System Prompt:**
```
You are an expert debugging assistant. When given a failed command and its error output:
- Identify the specific error that occurred
- Explain why it happened (root cause)
- Describe what the error message means in plain terms
- Point out any relevant context from the command or output
- Keep the explanation focused on understanding the problem
Be clear, empathetic, and educational. Don't suggest fixes yet - focus on understanding.
```

**User Prompt Template:**
```
This command failed. Help me understand what went wrong:

Command:
python train.py --epochs 100

Error output:
Traceback (most recent call last):
  File "train.py", line 45, in <module>
    model = load_model('weights.h5')
FileNotFoundError: [Errno 2] No such file or directory: 'weights.h5'

Exit code: 1
```

**Expected AI Response:**
> The script failed because it couldn't find the file `weights.h5`:
> 
> **What happened:** Python raised a `FileNotFoundError` on line 45 when trying to load the model weights.
> 
> **Why it happened:** The `load_model()` function looks for `weights.h5` in the current directory, but the file doesn't exist there.
> 
> **Common causes:**
> - The file was never created (first time running?)
> - You're in the wrong directory
> - The file has a different name or is in a subdirectory
> - The file was deleted or moved

---

### 3. 🔧 Suggest Fix
**Shows:** Only when `exitCode !== 0`  
**Purpose:** Solution - get it working

**System Prompt:**
```
You are a solution-focused terminal assistant. When given a failed command:
- Provide specific, actionable fixes for the error
- List multiple solutions if applicable (ordered by likelihood of success)
- Include the exact commands to run when possible
- Explain why each fix should work
- Warn about potential side effects or considerations
Format fixes as clear steps or code blocks. Be practical and direct.
```

**User Prompt Template:**
```
This command failed. Suggest how to fix it:

Command:
npm start

Error output:
Error: Cannot find module 'express'
    at Function.Module._resolveFilename (internal/modules/cjs/loader.js:636:15)

Exit code: 1

Provide specific fixes I can try.
```

**Expected AI Response:**
> The `express` module is missing from your project. Here's how to fix it:
> 
> **Solution 1: Install missing dependencies** (most likely)
> ```bash
> npm install
> ```
> This installs all dependencies listed in `package.json`. Run this first.
> 
> **Solution 2: Install express specifically**
> If `npm install` doesn't work:
> ```bash
> npm install express
> ```
> 
> **Solution 3: Check package.json**
> Verify express is listed in dependencies:
> ```bash
> cat package.json | grep express
> ```
> If it's missing, add it:
> ```bash
> npm install express --save
> ```
> 
> **Note:** After installing, run `npm start` again. The module should now be found.

---

### 4. ➡️ What's Next?
**Shows:** Only when `exitCode === 0` or undefined  
**Purpose:** Workflow - continue the task

**System Prompt:**
```
You are a workflow assistant helping users accomplish their goals. When given a successful command and output:
- Infer what the user is trying to accomplish
- Suggest logical next steps in that workflow
- Provide specific commands when applicable
- Explain why each suggestion makes sense
- Keep suggestions relevant to the current context
Be concise and focus on the 2-3 most likely next actions. Format commands as code blocks.
```

**User Prompt Template:**
```
This command succeeded. What are logical next steps?

Command:
git clone https://github.com/user/ml-project.git

Output:
Cloning into 'ml-project'...
remote: Enumerating objects: 1234, done.
remote: Counting objects: 100% (1234/1234), done.
Receiving objects: 100% (1234/1234), 5.67 MiB | 2.34 MiB/s, done.
Resolving deltas: 100% (789/789), done.

Exit code: 0
```

**Expected AI Response:**
> You've successfully cloned the repository. Typical next steps:
> 
> **1. Explore the project structure**
> ```bash
> cd ml-project
> ls -la
> cat README.md
> ```
> Check the README for setup instructions and project overview.
> 
> **2. Install dependencies**
> If there's a `requirements.txt`:
> ```bash
> pip install -r requirements.txt
> ```
> Or if using `package.json`:
> ```bash
> npm install
> ```
> 
> **3. Check for setup scripts**
> ```bash
> ls *.sh
> cat setup.sh  # if exists
> ```
> Many ML projects have setup scripts for data/models.

---

## Implementation Details

### Context Captured
Each quick action automatically captures:
- Command text
- Output text (if available)
- Exit code
- Current working directory
- Timestamp

### System Architecture
```
User clicks marker → Opens menu
  ↓
User clicks Quick Action button
  ↓
handleQuickAction()
  ├─ Builds tailored prompt (system + user)
  ├─ Adds command/output to AI context
  ├─ Closes marker menu
  └─ Opens AI panel with pre-filled context
      ↓
  AI responds with specialized guidance
```

### Benefits

1. **Contextual** - Right action at the right time
2. **Smart** - Tailored prompts = better responses  
3. **Fast** - One click instead of typing
4. **Educational** - Separate "explain" from "fix"
5. **Safe** - Context is explicit, user reviews before sending

## Future Enhancements

- **Auto-execute fixes** with confirmation
- **Learn from corrections** (if user modifies AI suggestion)
- **Command history patterns** (detect repeated failures)
- **Project-aware** suggestions (understand git/npm/python context)
- **Multi-step workflows** (AI suggests sequence of commands)
