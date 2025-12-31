# SSH Session Panel - Quick Reference

## Keyboard Shortcuts
- `Cmd/Ctrl + Shift + O` - Open SSH session panel window

## Status Indicators
- 🟢 **Green** - Connected, latency < 100ms
- 🟡 **Yellow** - Connected, latency > 500ms  
- 🔴 **Red** - Disconnected or error
- ⚪ **Gray** - Not connected

## Quick Start

### 1. Open SSH Panel Window
Press `Cmd/Ctrl + Shift + O` to open a separate window

### 2. Create Profile
```
Click [+] → Choose SSH Config or Manual
→ Name: "Prod Cluster"
→ Icon: 🖥️
→ Group: Production
→ Select from ~/.ssh/config OR enter manually
→ (Optional) Add startup commands
→ Save
```

### 3. Connect
```
Find profile → Click "Connect"
→ New tab opens
→ SSH command executes
→ Startup commands run
→ Status updates to 🟢
```

### 4. Manage Active Connection
```
See live latency: "45ms"
See connection time: "2m ago"
Click "Go to Tab" → Switch to that tab
Click "New Tab" → Open another connection
```

## Example Profiles

### HPC Login Node
```yaml
Name: HPC Login
Icon: 🖥️
Group: HPC
SSH Config: hpc-login
Startup Commands:
  - module load gcc/11 python/3.9
  - cd /scratch/$USER/project
```

### Production Server
```yaml
Name: Prod Web
Icon: 🚀
Group: Production
Tab Color: #ff6b6b (Red)
SSH Config: prod-web-01
Startup Commands:
  - cd /var/www/app
  - tail -f logs/access.log
```

### Jump Host Connection
```yaml
Name: Internal Server
Icon: 🔒
Group: Security
Manual Config:
  Hostname: internal.example.com
  Username: admin
  Proxy Jump: jump-host
```

## Tips

### Organize by Groups
- **Production** 🔴 - Critical servers
- **Staging** 🟡 - Testing environments
- **Development** 🟢 - Dev machines
- **HPC** 💻 - Compute clusters
- **Monitoring** 📊 - Prometheus, Grafana

### Use Startup Commands
```bash
# Load environment modules
module load gcc/11 openmpi/4.1 python/3.9

# Navigate to project
cd /scratch/$USER/current-project

# Activate virtual environment
source venv/bin/activate

# Show system info
echo "Connected to $(hostname)"
```

### Leverage SSH Config
Instead of duplicating SSH settings, reference your `~/.ssh/config`:
```ssh
# In ~/.ssh/config
Host prod-cluster
    HostName cluster.example.com
    User myuser
    IdentityFile ~/.ssh/prod_key
    ProxyJump jump-host
    ServerAliveInterval 60

# In AI Terminal profile
Connection Type: SSH Config
SSH Config Host: prod-cluster  ✓ (All settings inherited!)
```

## Files & Storage

### Profiles
`~/.config/aiterminal/ssh_profiles.json`

### SSH Config (read-only)
`~/.ssh/config`

## Connection Health Monitoring

### Automatic Tracking
- Checks every 5 seconds
- Updates status indicators
- Measures latency
- Cleans up on disconnect

### What's Tracked
- Connection status (connected/disconnected/error)
- Round-trip latency (ms)
- Connection start time
- Last activity timestamp
- Which tab the connection is in

## Troubleshooting

### Profile Not Connecting
1. Check SSH config is valid: `ssh <hostname>`
2. Verify identity file path exists
3. Test manual connection in regular terminal
4. Check startup commands for errors

### Status Shows Disconnected
- Tab might be closed
- SSH connection dropped
- Check latency pill in terminal footer

### Can't Find SSH Config Hosts
- Ensure `~/.ssh/config` exists
- Check file syntax with `ssh -G hostname`
- Click "Import from SSH Config" button

### Latency Shows "—"
- SSH not fully connected yet
- Wait 5 seconds for first measurement
- Check network connectivity

## Security

✅ **Safe**
- SSH keys stay in `~/.ssh/`
- Uses SSH agent
- No passwords stored
- Respects `~/.ssh/config` settings

❌ **Not Supported**
- Password authentication (use keys!)
- Storing private keys in app
- Plain text secrets

## Advanced Usage

### Multi-Connection Workflow
```
1. Open "prod-db" profile → Click Connect
2. SSH panel shows: 🟢 prod-db (12ms)
3. Open "prod-web" profile → Click Connect  
4. SSH panel shows:
   🟢 prod-db (12ms) [Go to Tab]
   🟢 prod-web (8ms) [Go to Tab]
5. Click "Go to Tab" on prod-db → Switches to that tab
```

### Template for Teams
Export your profiles JSON and share with team:
```bash
# Copy profiles
cp ~/.config/aiterminal/ssh_profiles.json team_profiles.json

# Team member imports
cp team_profiles.json ~/.config/aiterminal/ssh_profiles.json
```

---

**Ready to use!** Press `Cmd/Ctrl + Shift + O` to get started! 🚀
