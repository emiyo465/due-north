import type { FocusEvent } from "react"

/**
 * Handlers that report a list row as hovered or keyboard-focused, so its PDF
 * highlight can respond. Mouse clicks leave focus on the row's buttons, so only
 * visible (keyboard) focus counts.
 */
export function rowHoverProps(onHover: (hovering: boolean) => void) {
  return {
    onMouseEnter: () => onHover(true),
    onMouseLeave: () => onHover(false),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.target.matches(":focus-visible")) onHover(true)
    },
    onBlur: () => onHover(false),
  }
}
