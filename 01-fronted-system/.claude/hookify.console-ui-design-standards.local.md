---
name: console-ui-design-standards
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: app/\[orgSlug\]/.*\.(tsx|jsx)$
  - field: new_text
    operator: regex_match
    pattern: (bg-slate-900|bg-black|bg-gray-900|bg-slate-800|bg-neutral-900).*?(button|Button|btn|click|onClick)|(button|Button|btn).*?(bg-slate-900|bg-black|bg-gray-900|bg-slate-800|bg-neutral-900)
---

## Design Standards Violation Detected

You are adding **black/dark button styling** to a console UI component. This violates the CloudAct design system.

### Brand Colors
- **Primary (Mint):** #90FCA6 (text: black)
- **Secondary (Coral):** #FF6C5E
- **Accent (Blue):** #007AFF

### Required Changes

Instead of using inline dark colors like:
- `bg-slate-900`
- `bg-black`
- `bg-gray-900`
- `bg-slate-800`

**Use the design system classes:**

| Button Type | Class to Use |
|-------------|--------------|
| Primary actions | `console-button-primary` |
| Secondary actions | `console-button-secondary` |
| Destructive actions | `console-button-destructive` |
| Ghost/subtle actions | `console-button-ghost` |
| Outlined actions | `console-button-outline` |

### Examples

**Wrong:**
```tsx
<button className="bg-slate-900 text-white hover:bg-slate-800">
  Subscribe Now
</button>
```

**Correct:**
```tsx
<button className="console-button-primary">
  Subscribe Now
</button>
```

### Reference
See `app/[orgSlug]/console.css` for all button styles (lines 574-640).

**Please update your code to use the proper design system classes.**
