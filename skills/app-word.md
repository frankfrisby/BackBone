---
name: Microsoft Word
description: Create, edit, and format Word documents via desktop automation
triggers: [word, document, write a letter, word document, microsoft word, docx]
type: desktop-app
app: word
process: WINWORD
---

# Microsoft Word — Desktop Automation

## When to Use
- User asks to create or edit a Word document
- User wants to write a letter, report, or essay
- User asks to format text, add headers, insert tables

## Launch
- Command: `Start-Process winword -ArgumentList /w` (opens blank document, skips start screen)
- Wait: 6 seconds for full load
- Process name: `WINWORD`
- Window title contains: "Word" or "Document"

## Key Shortcuts
| Action | Shortcut |
|--------|----------|
| New document | Ctrl+N |
| Open file | Ctrl+O |
| Save | Ctrl+S |
| Save As | F12 |
| Bold | Ctrl+B |
| Italic | Ctrl+I |
| Underline | Ctrl+U |
| Undo | Ctrl+Z |
| Select all | Ctrl+A |
| Find | Ctrl+F |
| Replace | Ctrl+H |
| Print | Ctrl+P |
| Close | Alt+F4 (press N for "Don't Save") |

## Common Workflows

### Write and Save
1. Launch Word with /w flag
2. Type content
3. Ctrl+S to save (opens Save As for new docs)
4. Navigate to desired folder
5. Type filename and press Enter

### Format Text
1. Select text (Ctrl+A for all, or shift+click)
2. Apply formatting shortcuts
3. Font size: select text → type size in font size box

### Insert Table
1. Click Insert tab (or Alt+N)
2. Click Table → drag grid to select rows/columns
3. Tab between cells, Enter for new row

## Closing
- Alt+F4 sends close
- If unsaved: "Do you want to save?" dialog appears
- Press N for "Don't Save", Y for "Save", Escape to cancel
