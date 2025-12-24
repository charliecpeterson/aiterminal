# Split Panes Feature

## Overview
Added split pane functionality to AI Terminal, allowing multiple terminal panes within a single tab. The AI panel always interacts with the currently focused pane, indicated by a blue border and "🤖 AI Active" badge.

## Implementation Details

### Data Structures
- **Pane Interface**: `{ id: number, isRemote?: boolean, remoteHost?: string }`
- **Updated Tab Interface**:
  - `panes: Pane[]` - Array of panes in the tab
  - `focusedPaneId: number | null` - Currently focused pane
  - `splitLayout: 'single' | 'vertical' | 'horizontal'` - Current split configuration

### Core Functions
- **`splitPane(tabId, direction)`** - Spawns new PTY, adds pane to tab, sets focus
- **`closePane(tabId, paneId)`** - Closes PTY, removes pane, handles focus transition
- **`setFocusedPane(tabId, paneId)`** - Updates focused pane and active tab ID
- **`updateTabRemoteState(tabId, paneId, ...)`** - Updates specific pane's remote state

### Keyboard Shortcuts
- **Cmd+D** - Split vertically (new pane to the right)
- **Cmd+Shift+D** - Split horizontally (new pane below)
- **Cmd+W** - Close focused pane (closes tab if last pane)
- **Cmd+[** - Navigate to previous pane
- **Cmd+]** - Navigate to next pane

### Visual Design
- **Focus Indicator**: 2px blue border (#007acc) around focused pane
- **AI Active Badge**: "🤖 AI Active" badge in top-right corner of focused pane
- **Grid Layout**: CSS Grid for vertical/horizontal split arrangements
- **Smooth Transitions**: 150ms ease transitions for border and shadow

### AI Integration
- AI panel receives `focusedPaneId` instead of simple `activeTabId`
- Commands, context capture, and quick actions target the focused pane
- Focus changes immediately update AI panel's target terminal

## Usage
1. Open a terminal tab
2. Press **Cmd+D** to split vertically or **Cmd+Shift+D** to split horizontally
3. Click on any pane to focus it (blue border appears)
4. AI panel will interact with the focused pane
5. Use **Cmd+[** / **Cmd+]** to navigate between panes
6. Press **Cmd+W** to close the focused pane

## Technical Notes
- Each pane has its own PTY session
- Panes inherit the tab's initial settings but operate independently
- Closing the last pane closes the entire tab
- Focus automatically moves to remaining panes when one closes
- Split layout persists per tab (not global)

## Future Enhancements
- Save/restore split layouts in session persistence
- Configurable split ratios (50/50, 60/40, etc.)
- More than 2 panes (complex grid layouts)
- Drag-and-drop pane reordering
- Quick split from selection (right-click → "Split Here")
