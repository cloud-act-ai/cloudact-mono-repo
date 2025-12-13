# Toast & Alert Color Reference Guide

## Brand Colors Used

### Success - Green
```
Primary: #34C759 (iOS Green)
Light BG: #F0FFF4
Dark BG: #064E3B
Title (Light): #065F46
Title (Dark): #86EFAC
```

### Error - Coral
```
Primary: #FF6E50 (CloudAct Coral)
Light BG: #FFF5F5
Dark BG: #7F1D1D
Title (Light): #991B1B
Title (Dark): #FCA5A5
```

### Info - Teal
```
Primary: #007A78 (CloudAct Teal)
Light BG: #F0FDFA
Dark BG: #134E4A
Title (Light): #134E4A
Title (Dark): #5EEAD4
```

### Warning - Orange
```
Primary: #FF9500 (iOS Orange)
Light BG: #FFFBEB
Dark BG: #78350F
Title (Light): #78350F
Title (Dark): #FCD34D
```

## CSS Selectors

### Toast Types
- `[data-sonner-toast][data-type="success"]` - Success toasts
- `[data-sonner-toast][data-type="error"]` - Error toasts
- `[data-sonner-toast][data-type="info"]` - Info toasts
- `[data-sonner-toast][data-type="warning"]` - Warning toasts
- `[data-sonner-toast][data-type="loading"]` - Loading toasts

### Toast Elements
- `[data-icon]` - Toast icon
- `[data-title]` - Toast title
- `[data-description]` - Toast description
- `[data-close-button]` - Close button
- `[data-button]` - Action button
- `[data-content]` - Content wrapper

### Alert Variants
- `variant="success"` - Success alert
- `variant="destructive"` - Error alert (uses Coral)
- `variant="warning"` - Warning alert
- `variant="info"` - Info alert
- `variant="default"` - Default alert

## Quick Reference

| Toast Type | Border Color | Icon Color | Background (Light) | Background (Dark) |
|------------|-------------|------------|-------------------|------------------|
| Success    | #34C759     | #34C759    | #F0FFF4          | #064E3B          |
| Error      | #FF6E50     | #FF6E50    | #FFF5F5          | #7F1D1D          |
| Info       | #007A78     | #007A78    | #F0FDFA          | #134E4A          |
| Warning    | #FF9500     | #FF9500    | #FFFBEB          | #78350F          |

## Design Tokens

Located in `/app/globals.css`:

```css
--cloudact-teal: #007A78
--cloudact-teal-dark: #005F5D
--cloudact-coral: #FF6E50
--cloudact-coral-dark: #E55A3C
```

## Animation Timing

- Slide In: 0.3s cubic-bezier(0.21, 1.02, 0.73, 1)
- Slide Out: 0.2s cubic-bezier(0.06, 0.71, 0.55, 1)
- From/To: translateX(100%) → translateX(0)

## Shadow Styling

```css
box-shadow: 
  0 4px 12px rgba(0, 0, 0, 0.15),  /* Main shadow */
  0 0 0 1px rgba(0, 0, 0, 0.05)     /* Border shadow */
```

